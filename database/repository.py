"""
Repository classes implementing database operations for each entity in the ER Diagram.
Connects directly to Supabase via the official Python Client.
"""

from typing import List, Dict, Any, Optional
from .client import get_supabase_client
from .models import (
    User,
    Product,
    Order,
    OrderItem,
    CartItem,
    WishlistItem,
    Interaction,
    Event,
    SearchHistory,
    SearchLog,
)


class UserRepository:
    """Manages USERS in Supabase."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def get_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        res = self.supabase.table("users").select("*").eq("id", user_id).execute()
        return res.data[0] if res.data else None

    def get_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        res = self.supabase.table("users").select("*").ilike("email", email).execute()
        return res.data[0] if res.data else None

    def create(self, user: User) -> Dict[str, Any]:
        res = self.supabase.table("users").insert(user.to_dict()).execute()
        return res.data[0] if res.data else {}

    def list_all(self, limit: int = 50) -> List[Dict[str, Any]]:
        res = self.supabase.table("users").select("*").limit(limit).execute()
        return res.data or []


class ProductRepository:
    """Manages PRODUCTS in Supabase."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def get_by_id(self, product_id: str) -> Optional[Dict[str, Any]]:
        res = self.supabase.table("products").select("*").eq("id", product_id).execute()
        return res.data[0] if res.data else None

    def list_by_category(self, category: str, limit: int = 20) -> List[Dict[str, Any]]:
        res = self.supabase.table("products").select("*").eq("category", category).limit(limit).execute()
        return res.data or []

    def save(self, product: Product) -> Dict[str, Any]:
        res = self.supabase.table("products").upsert(product.to_dict()).execute()
        return res.data[0] if res.data else {}

    def delete(self, product_id: str) -> bool:
        res = self.supabase.table("products").delete().eq("id", product_id).execute()
        return bool(res.data)


class CartRepository:
    """Manages CART_ITEMS junction table."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def get_cart(self, user_id: str) -> List[Dict[str, Any]]:
        res = self.supabase.table("cart_items").select("*, products(*)").eq("user_id", user_id).execute()
        return res.data or []

    def add_or_update_item(self, user_id: str, product_id: str, quantity: int = 1) -> Dict[str, Any]:
        # Check existing
        existing = (
            self.supabase.table("cart_items")
            .select("quantity")
            .eq("user_id", user_id)
            .eq("product_id", product_id)
            .execute()
        )
        new_qty = quantity
        if existing.data:
            new_qty += existing.data[0]["quantity"]

        res = (
            self.supabase.table("cart_items")
            .upsert({"user_id": user_id, "product_id": product_id, "quantity": new_qty})
            .execute()
        )
        return res.data[0] if res.data else {}

    def remove_item(self, user_id: str, product_id: str) -> bool:
        res = (
            self.supabase.table("cart_items")
            .delete()
            .eq("user_id", user_id)
            .eq("product_id", product_id)
            .execute()
        )
        return bool(res.data)

    def clear_cart(self, user_id: str) -> bool:
        res = self.supabase.table("cart_items").delete().eq("user_id", user_id).execute()
        return bool(res.data)


class WishlistRepository:
    """Manages WISHLIST_ITEMS junction table."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def get_wishlist(self, user_id: str) -> List[Dict[str, Any]]:
        res = self.supabase.table("wishlist_items").select("*, products(*)").eq("user_id", user_id).execute()
        return res.data or []

    def add_to_wishlist(self, user_id: str, product_id: str) -> Dict[str, Any]:
        res = (
            self.supabase.table("wishlist_items")
            .upsert({"user_id": user_id, "product_id": product_id})
            .execute()
        )
        return res.data[0] if res.data else {}

    def remove_from_wishlist(self, user_id: str, product_id: str) -> bool:
        res = (
            self.supabase.table("wishlist_items")
            .delete()
            .eq("user_id", user_id)
            .eq("product_id", product_id)
            .execute()
        )
        return bool(res.data)


class OrderRepository:
    """Manages ORDERS and ORDER_ITEMS tables."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def create_order(self, order: Order, items: List[OrderItem]) -> Dict[str, Any]:
        # 1. Insert order
        order_res = self.supabase.table("orders").insert(order.to_dict()).execute()
        if not order_res.data:
            raise RuntimeError("Failed to create order record")

        # 2. Insert order items
        item_dicts = [item.to_dict() for item in items]
        if item_dicts:
            self.supabase.table("order_items").insert(item_dicts).execute()

        return order_res.data[0]

    def get_order_by_id(self, order_id: str) -> Optional[Dict[str, Any]]:
        res = self.supabase.table("orders").select("*, order_items(*)").eq("id", order_id).execute()
        return res.data[0] if res.data else None

    def list_user_orders(self, user_id: str) -> List[Dict[str, Any]]:
        res = (
            self.supabase.table("orders")
            .select("*, order_items(*)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []


class InteractionRepository:
    """Manages INTERACTIONS for recommendation algorithms."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def log_interaction(self, interaction: Interaction) -> Dict[str, Any]:
        res = self.supabase.table("interactions").insert(interaction.to_dict()).execute()
        return res.data[0] if res.data else {}

    def get_user_interactions(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        res = (
            self.supabase.table("interactions")
            .select("*")
            .eq("user_id", user_id)
            .order("ts", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []


class EventRepository:
    """Manages telemetry EVENTS."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def record_event(self, event: Event) -> Dict[str, Any]:
        res = self.supabase.table("events").insert(event.to_dict()).execute()
        return res.data[0] if res.data else {}


class SearchRepository:
    """Manages SEARCH_HISTORY and SEARCH_LOGS."""

    def __init__(self):
        self.supabase = get_supabase_client()

    def record_user_search(self, history: SearchHistory) -> Dict[str, Any]:
        res = self.supabase.table("search_history").insert(history.to_dict()).execute()
        return res.data[0] if res.data else {}

    def record_search_log(self, log: SearchLog) -> Dict[str, Any]:
        res = self.supabase.table("search_logs").insert(log.to_dict()).execute()
        return res.data[0] if res.data else {}

    def get_recent_user_searches(self, user_id: str, limit: int = 10) -> List[Dict[str, Any]]:
        res = (
            self.supabase.table("search_history")
            .select("query, ts")
            .eq("user_id", user_id)
            .order("id", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data or []
