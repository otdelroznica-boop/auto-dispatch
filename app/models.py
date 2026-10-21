from typing import Literal, Optional

from pydantic import BaseModel, Field

TIME = r"^([01]\d|2[0-4]):[0-5]\d$"
DATE = r"^\d{4}-\d{2}-\d{2}$"


class LoginIn(BaseModel):
    user_id: int
    pin: str


class UserIn(BaseModel):
    name: str = Field(min_length=1)
    pin: Optional[str] = None
    is_admin: bool = False
    active: bool = True


class DriverIn(BaseModel):
    name: str = Field(min_length=1)
    phone: str = ""
    tg_chat_id: str = ""
    active: int = 1


class VehicleIn(BaseModel):
    name: str = Field(min_length=1)
    plate: str = ""
    color: str = "#dc2626"
    default_driver_id: Optional[int] = None
    sort: int = 0
    active: int = 1
    ownership: Literal["own", "hired"] = "own"
    owner_name: str = ""
    owner_share: float = Field(default=0, ge=0, le=100)
    type_id: Optional[int] = None
    brand: str = ""
    year: int = 0
    vin: str = ""
    pts: str = ""
    sts: str = ""
    mileage: int = 0
    mileage_date: str = ""
    osago_until: str = ""
    inspection_until: str = ""
    service_every_km: int = 0
    last_service_km: int = 0
    fleet_note: str = ""


class TypeIn(BaseModel):
    name: str = Field(min_length=1)
    sort: int = 0
    active: int = 1


class ExpenseIn(BaseModel):
    vehicle_id: int
    date: str = Field(pattern=DATE)
    category_id: Optional[int] = None
    title: str = ""
    amount: float = 0
    mileage: int = 0
    note: str = ""


class DocIn(BaseModel):
    title: str = Field(min_length=1)
    original_name: str = ""
    mime: str = ""
    data_b64: str          # содержимое файла в base64


class ReasonIn(BaseModel):
    title: str = Field(min_length=1)
    sort: int = 0
    active: int = 1


class ServiceIn(BaseModel):
    type_id: Optional[int] = None
    title: str = Field(min_length=1)
    price: float = 0
    unit: str = "шт"
    active: int = 1


class ClientIn(BaseModel):
    id: Optional[int] = None
    kind: Literal["person", "org"] = "person"
    name: str = ""
    phone: str = ""
    inn: str = ""
    note: str = ""


class OrderLineIn(BaseModel):
    service_id: Optional[int] = None
    title: str
    qty: float = 1
    price: float = 0


class OrderIn(BaseModel):
    vehicle_id: int
    driver_id: Optional[int] = None
    date: str = Field(pattern=DATE)
    start_time: str = Field(pattern=TIME)
    end_time: str = Field(pattern=TIME)
    client: Optional[ClientIn] = None
    address_from: str = ""
    address_to: str = ""
    note: str = ""
    status: Literal["new", "work", "done", "cancel"] = "new"
    lines: list[OrderLineIn] = []
    plan_amount: float = 0
    paid_amount: float = 0
    payment_method: Literal["cash", "card", "invoice"] = "cash"
    force: bool = False  # записать, несмотря на пересечение по времени


class StatusIn(BaseModel):
    status: Literal["new", "work", "done", "cancel"]


class PayIn(BaseModel):
    paid_amount: float
    payment_method: Optional[Literal["cash", "card", "invoice"]] = None
    mark_done: bool = False


class SettingsIn(BaseModel):
    company_name: Optional[str] = None
    day_start: Optional[int] = Field(default=None, ge=0, le=23)
    day_end: Optional[int] = Field(default=None, ge=1, le=24)
    tg_token: Optional[str] = None
    tg_dispatch_chat: Optional[str] = None


class LostIn(BaseModel):
    date: str = Field(pattern=DATE)
    time: str = ""
    type_id: Optional[int] = None
    reason_id: Optional[int] = None
    lines: list[OrderLineIn] = []
    amount: float = 0
    client_phone: str = ""
    note: str = ""
    partner: bool = False
    partner_name: str = ""
    partner_income: float = 0
