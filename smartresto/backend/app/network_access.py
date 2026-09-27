"""Local address discovery; no Internet request, no shell and no router changes."""
import ipaddress
import json
import socket
import subprocess
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Literal
from starlette.concurrency import run_in_threadpool

from .db import connect, one
from .security import require

router = APIRouter(prefix='/api/network', dependencies=[Depends(require('gerant'))])


def usable_ipv4(value):
    try:
        ip = ipaddress.IPv4Address(value)
        return not (ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local or ip.is_reserved)
    except ValueError:
        return False


def discover_addresses():
    """Enumerate UP Linux interfaces even on a LAN without a default gateway."""
    found = {}
    default_interface = None
    try:
        routes = json.loads(subprocess.run(['ip', '-j', '-4', 'route', 'show', 'default'],
            capture_output=True, text=True, timeout=2, check=True).stdout)
        if routes:
            default_interface = min(routes, key=lambda r: r.get('metric', 0)).get('dev')
    except (OSError, ValueError, subprocess.SubprocessError):
        pass
    try:
        interfaces = json.loads(subprocess.run(['ip', '-j', '-4', 'address', 'show', 'up'],
            capture_output=True, text=True, timeout=2, check=True).stdout)
        for interface in interfaces:
            name = interface.get('ifname', '')
            for address in interface.get('addr_info', []):
                value = address.get('local', '')
                if usable_ipv4(value):
                    found[value] = name
    except (OSError, ValueError, subprocess.SubprocessError):
        # iproute2 is not present on some minimal Linux installations.
        try:
            import fcntl
            import struct
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
                for _, name in socket.if_nameindex():
                    try:
                        req = struct.pack('256s', name.encode()[:15])
                        flags = struct.unpack_from('H', fcntl.ioctl(sock.fileno(), 0x8913, req), 16)[0]
                        if flags & 1:
                            value = socket.inet_ntoa(fcntl.ioctl(sock.fileno(), 0x8915, req)[20:24])
                            if usable_ipv4(value):
                                found[value] = name
                    except OSError:
                        continue
        except (ImportError, OSError):
            pass
    # Hostname lookup is only a fallback, never a public connectivity probe.
    if not found:
        try:
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                value = info[4][0]
                if usable_ipv4(value):
                    found[value] = 'Réseau local'
        except OSError:
            pass
    virtual = ('docker', 'veth', 'br-', 'virbr', 'tun', 'tap', 'wg', 'tailscale')
    rows = [{'address': value, 'interface': name, 'default': name == default_interface,
             'virtual': name.startswith(virtual)} for value, name in found.items()]
    return sorted(rows, key=lambda r: (r['virtual'], not r['default'], r['interface'], r['address']))


def normalize_origin(value):
    try:
        parsed = urlsplit(value.strip())
        host, port = parsed.hostname, parsed.port
        if (parsed.scheme not in ('http', 'https') or not host or parsed.username or parsed.password
                or parsed.path not in ('', '/') or parsed.query or parsed.fragment
                or any(c.isspace() or c in '\\<>"' for c in value)
                or host == 'localhost' or host.endswith('.localhost')):
            raise ValueError()
        try:
            ip = ipaddress.ip_address(host)
        except ValueError:
            ip = None
        if ip and (ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.is_link_local):
            raise ValueError()
        authority = f'[{host}]' if ':' in host else host
        if port and port != (443 if parsed.scheme == 'https' else 80):
            authority += f':{port}'
        return f'{parsed.scheme}://{authority}'
    except ValueError:
        raise HTTPException(422, 'Indiquez une adresse HTTP ou HTTPS accessible aux téléphones, sans chemin ni code de table.')


async def initialize_network():
    async with connect(True) as db:
        await db.execute('CREATE TABLE IF NOT EXISTS network_settings (id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL, origin TEXT NOT NULL)')
        await db.execute("INSERT OR IGNORE INTO network_settings VALUES (1, 'auto', '')")


class NetworkSettings(BaseModel):
    mode: Literal['auto', 'manual']
    origin: str = ''


def address_choices(rows, scheme, port, current):
    # An IP substituted into HTTPS may not be covered by the installed certificate.
    if scheme == 'https':
        return ([{'origin': current, 'interface': 'Adresse HTTPS actuelle'}] if current else [])
    suffix = f':{port}' if port and port != 80 else ''
    return [{**row, 'origin': f"http://{row['address']}{suffix}"} for row in rows]


@router.get('')
async def network_info(request: Request):
    rows = await run_in_threadpool(discover_addresses)
    try:
        current = normalize_origin(str(request.base_url))
    except HTTPException:
        current = ''
    choices = address_choices(rows, request.url.scheme, request.url.port, current)
    host = request.url.hostname or ''
    try:
        ipaddress.ip_address(host)
        named = False
    except ValueError:
        named = bool(current)
    # Keep working DNS/HTTPS origins; on localhost choose the real LAN interface.
    suggested = current if named or request.url.scheme == 'https' else ''
    if not suggested:
        suggested = next((r['origin'] for r in choices if not r.get('virtual')), '')
    if not suggested and current:
        suggested = current
    async with connect() as db:
        saved = await one(db, 'SELECT mode, origin FROM network_settings WHERE id=1')
    active = saved['origin'] if saved['mode'] == 'manual' else suggested
    return {'mode': saved['mode'], 'saved_origin': saved['origin'], 'origin': active,
            'suggested_origin': suggested, 'choices': choices, 'https': request.url.scheme == 'https'}


@router.put('')
async def save_network(body: NetworkSettings):
    origin = normalize_origin(body.origin) if body.mode == 'manual' else ''
    async with connect(True) as db:
        await db.execute('UPDATE network_settings SET mode=?, origin=? WHERE id=1', (body.mode, origin))
    return {'mode': body.mode, 'origin': origin}
