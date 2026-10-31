"""
Entity Models matching the ShopSense ER Diagram.
All attributes, primary keys, and foreign keys directly correspond to:
- USERS
- PRODUCTS
- ORDERS
- WISHLIST_ITEMS
- CART_ITEMS
- ORDER_ITEMS
- INTERACTIONS
- EVENTS
- SEARCH_HISTORY
- SEARCH_LOGS
"""

from dataclasses import dataclass, field, asdict
from typing import Optional, Dict, Any


@dataclass
class User:
    """USERS Entity: Represents an application user or customer."""
    user_id: str
    name: str
    email: Optional[str] = None
    role: str = "user"
    phone: Optional[str] = None
    profession: Optional[str] = None
    is_seed: bool = False
    password_hash: Optional[str] = None
    preferences: Dict[str, Any] = field(default_factory=dict)
    cold_start: bool = False
    created_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.user_id,
            "name": self.name,
            "email": self.email,
            "role": self.role,
            "phone": self.phone,
            "profession": self.profession,
            "is_seed": self.is_seed,
            "password_hash": self.password_hash,
            "preferences": self.preferences,
            "cold_start": self.cold_start,
        }


@dataclass
class Product:
    """PRODUCTS Entity: Items available in the catalog."""
    product_id: str
    title: str
    brand: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    mrp: Optional[float] = None
    rating: Optional[float] = None
    rating_count: int = 0
    currency: str = "INR"
    data: Dict[str, Any] = field(default_factory=dict)  # Full JSON doc

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.product_id,
            "title": self.title,
            "brand": self.brand,
            "category": self.category,
            "price": self.price,
            "mrp": self.mrp,
            "rating": self.rating,
            "rating_count": self.rating_count,
            "currency": self.currency,
            "data": self.data,
        }


@dataclass
class Order:
    """ORDERS Entity: Placed by USERS (1:N)."""
    order_id: str
    user_id: str  # Foreign Key -> USERS.user_id
    status: str = "pending"
    total: float = 0.0
    item_count: int = 0
    currency: str = "INR"
    created_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.order_id,
            "user_id": self.user_id,
            "status": self.status,
            "total": self.total,
            "item_count": self.item_count,
            "currency": self.currency,
        }


@dataclass
class OrderItem:
    """ORDER_ITEMS Entity: Weak entity / junction of ORDERS and PRODUCTS."""
    order_id: str  # Composite PK, FK -> ORDERS.order_id
    product_id: str  # Composite PK, FK -> PRODUCTS.product_id
    price_at_purchase: float
    quantity: int = 1
    title: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_id": self.order_id,
            "product_id": self.product_id,
            "price": self.price_at_purchase,
            "quantity": self.quantity,
            "title": self.title,
        }


@dataclass
class CartItem:
    """CART_ITEMS Entity: Active cart junction between USERS and PRODUCTS."""
    user_id: str  # Composite PK, FK -> USERS.user_id
    product_id: str  # Composite PK, FK -> PRODUCTS.product_id
    quantity: int = 1
    added_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "product_id": self.product_id,
            "quantity": self.quantity,
        }


@dataclass
class WishlistItem:
    """WISHLIST_ITEMS Entity: Saved products junction between USERS and PRODUCTS."""
    user_id: str  # Composite PK, FK -> USERS.user_id
    product_id: str  # Composite PK, FK -> PRODUCTS.product_id
    added_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "product_id": self.product_id,
        }


@dataclass
class Interaction:
    """INTERACTIONS Entity: Implicit feedback for Recommender (views, clicks, purchases)."""
    interaction_id: str
    user_id: Optional[str]  # FK -> USERS.user_id
    product_id: str  # FK -> PRODUCTS.product_id
    type: str  # 'view', 'cart', 'purchase'
    ts: Optional[str] = None
    session_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.interaction_id,
            "user_id": self.user_id,
            "product_id": self.product_id,
            "type": self.type,
            "ts": self.ts,
            "session_id": self.session_id,
        }


@dataclass
class Event:
    """EVENTS Entity: Telemetry and user clickstream events."""
    event_id: Optional[int] = None
    user_id: Optional[str] = None  # FK -> USERS.user_id
    product_id: Optional[str] = None  # FK -> PRODUCTS.product_id (nullable)
    type: str = "view"
    session_id: Optional[str] = None
    ts: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        d = {
            "user_id": self.user_id,
            "product_id": self.product_id,
            "type": self.type,
            "session_id": self.session_id,
        }
        if self.event_id is not None:
            d["id"] = self.event_id
        return d


@dataclass
class SearchHistory:
    """SEARCH_HISTORY Entity: Personalized search queries per user."""
    search_history_id: Optional[int] = None
    user_id: str = ""  # FK -> USERS.user_id
    query: str = ""
    total: Optional[int] = None
    ts: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "query": self.query,
            "total": self.total,
        }


@dataclass
class SearchLog:
    """SEARCH_LOGS Entity: System-wide search click-through tracking."""
    search_log_id: Optional[int] = None
    query: str = ""
    total: Optional[int] = None
    clicked_product_id: Optional[str] = None  # FK -> PRODUCTS.product_id (nullable)
    ts: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query": self.query,
            "total": self.total,
            "clicked_product_id": self.clicked_product_id,
        }
