from typing import Literal
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict

class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Login(StrictModel):
    role: Literal['client','cuisine','gerant']
    pin: str = Field(min_length=1, max_length=100)

class Category(StrictModel):
    nom: str = Field(min_length=1, max_length=80)

class Dish(StrictModel):
    categorie_id: int = Field(gt=0)
    nom: str = Field(min_length=1, max_length=100)
    description: str = Field(default='', max_length=500)
    prix: int = Field(ge=0, le=1000000, strict=True)
    photo: str = Field(default='/photos/plat.svg', pattern=r'^/photos/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$')
    personnalisable: bool = False
    disponible: bool = True

class Stock(StrictModel):
    quantite: int = Field(ge=0, le=100000, strict=True)

class Availability(StrictModel):
    disponible: bool

class OrderItem(StrictModel):
    plat_id: int = Field(gt=0)
    quantite: int = Field(ge=1, le=50, strict=True)
    cuisson: Literal['', 'Saignant', 'À point', 'Bien cuit'] = ''
    sans_piment: bool = False
    sans_oignon: bool = False
    allergies: str = Field(default='', max_length=250)
    note: str = Field(default='', max_length=250)

class Order(StrictModel):
    cle: UUID
    table_num: int = Field(ge=1, le=200, strict=True)
    items: list[OrderItem] = Field(min_length=1, max_length=50)

class Status(StrictModel):
    statut: Literal['en_cuisson','pret','servi']

class Payment(StrictModel):
    mode: Literal['especes','mobile_money','carte']

class Alert(StrictModel):
    cle: UUID
    table_num: int = Field(ge=1, le=200, strict=True)
    motif: Literal['Eau','Addition','Question']

class TableLogin(StrictModel):
    table_num: int = Field(ge=1, le=200, strict=True)
    token: str = Field(min_length=32, max_length=100, pattern=r'^[A-Za-z0-9_-]+$')
