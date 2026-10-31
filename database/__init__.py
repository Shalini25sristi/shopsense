"""
ShopSense Python Database Package.
Powered by Supabase (PostgreSQL) and structured according to the ShopSense ER Diagram.
"""

from .client import get_supabase_client
from .repository import (
    UserRepository,
    ProductRepository,
    OrderRepository,
    CartRepository,
    WishlistRepository,
    InteractionRepository,
    EventRepository,
    SearchRepository,
)

__all__ = [
    "get_supabase_client",
    "UserRepository",
    "ProductRepository",
    "OrderRepository",
    "CartRepository",
    "WishlistRepository",
    "InteractionRepository",
    "EventRepository",
    "SearchRepository",
]
