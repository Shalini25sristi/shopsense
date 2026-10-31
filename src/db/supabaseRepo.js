"use strict";
/**
 * Supabase PostgreSQL Repository for ShopSense.
 * Mirrors the repository interface in src/db/database.js.
 */

function createSupabaseRepo(supabase) {
  return {
    raw: supabase,

    products: {
      async count() {
        const { count, error } = await supabase.from("products").select("*", { count: "exact", head: true });
        if (error) throw error;
        return count || 0;
      },
      async all() {
        const { data, error } = await supabase.from("products").select("data").order("id");
        if (error) throw error;
        return (data || []).map((r) => r.data);
      },
      async get(id) {
        const { data, error } = await supabase.from("products").select("data").eq("id", id).maybeSingle();
        if (error) throw error;
        return data ? data.data : null;
      },
      async save(product) {
        const now = new Date().toISOString();
        const row = {
          id: product.id,
          title: product.title,
          brand: product.brand || null,
          category: product.category || null,
          price: product.price != null ? Number(product.price) : null,
          mrp: product.mrp != null ? Number(product.mrp) : null,
          currency: product.currency || "INR",
          rating: product.rating != null ? Number(product.rating) : null,
          rating_count: product.ratingCount != null ? Number(product.ratingCount) : 0,
          data: product,
          updated_at: now,
        };
        const { error } = await supabase.from("products").upsert(row);
        if (error) throw error;
        return product;
      },
      async remove(id) {
        const { error } = await supabase.from("products").delete().eq("id", id);
        if (error) throw error;
        return true;
      },
      async saveMany(products) {
        const records = products.map((p) => ({
          id: p.id,
          title: p.title,
          brand: p.brand || null,
          category: p.category || null,
          price: p.price != null ? Number(p.price) : null,
          mrp: p.mrp != null ? Number(p.mrp) : null,
          currency: p.currency || "INR",
          rating: p.rating != null ? Number(p.rating) : null,
          rating_count: p.ratingCount != null ? Number(p.ratingCount) : 0,
          data: p,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from("products").upsert(records);
        if (error) throw error;
        return products.length;
      },
    },

    users: {
      async count() {
        const { count, error } = await supabase.from("users").select("*", { count: "exact", head: true });
        if (error) throw error;
        return count || 0;
      },
      async get(id) {
        const { data, error } = await supabase.from("users").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data;
      },
      async getByEmail(email) {
        const { data, error } = await supabase.from("users").select("*").ilike("email", email).maybeSingle();
        if (error) throw error;
        return data;
      },
      async insert(user) {
        const row = {
          id: user.id,
          name: user.name,
          email: user.email || null,
          password_hash: user.passwordHash || null,
          role: user.role || "user",
          cold_start: Boolean(user.coldStart),
          phone: user.phone || null,
          profession: user.profession || null,
          preferences: user.preferences || {},
          created_at: user.createdAt || new Date().toISOString(),
          is_seed: Boolean(user.isSeed),
        };
        const { data, error } = await supabase.from("users").insert(row).select().single();
        if (error) throw error;
        return data;
      },
      async all() {
        const { data, error } = await supabase.from("users").select("*").order("created_at");
        if (error) throw error;
        return data || [];
      },
      async listReal() {
        const { data, error } = await supabase
          .from("users")
          .select("*")
          .eq("is_seed", false)
          .eq("role", "user")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async realCount() {
        const { count, error } = await supabase
          .from("users")
          .select("*", { count: "exact", head: true })
          .eq("is_seed", false)
          .eq("role", "user");
        if (error) throw error;
        return count || 0;
      },
    },

    wishlist: {
      async list(userId) {
        const { data, error } = await supabase
          .from("wishlist_items")
          .select("product_id, added_at")
          .eq("user_id", userId)
          .order("added_at", { ascending: false });
        if (error) throw error;
        return (data || []).map((r) => ({ productId: r.product_id, addedAt: r.added_at }));
      },
      async ids(userId) {
        const { data, error } = await supabase.from("wishlist_items").select("product_id").eq("user_id", userId);
        if (error) throw error;
        return (data || []).map((r) => r.product_id);
      },
      async has(userId, productId) {
        const { data, error } = await supabase
          .from("wishlist_items")
          .select("product_id")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .maybeSingle();
        if (error) throw error;
        return Boolean(data);
      },
      async add(userId, productId) {
        const { error } = await supabase.from("wishlist_items").upsert({
          user_id: userId,
          product_id: productId,
          added_at: new Date().toISOString(),
        });
        if (error) throw error;
        return true;
      },
      async remove(userId, productId) {
        const { error } = await supabase
          .from("wishlist_items")
          .delete()
          .eq("user_id", userId)
          .eq("product_id", productId);
        if (error) throw error;
        return true;
      },
      async count(userId) {
        const { count, error } = await supabase
          .from("wishlist_items")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        if (error) throw error;
        return count || 0;
      },
    },

    interactions: {
      async count() {
        const { count, error } = await supabase.from("interactions").select("*", { count: "exact", head: true });
        if (error) throw error;
        return count || 0;
      },
      async all() {
        const { data, error } = await supabase.from("interactions").select("*").order("ts");
        if (error) throw error;
        return (data || []).map((r) => ({
          id: r.id,
          userId: r.user_id,
          productId: r.product_id,
          type: r.type,
          ts: r.ts,
          sessionId: r.session_id,
        }));
      },
      async insert(ev) {
        const row = {
          id: ev.id || `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          user_id: ev.userId || null,
          product_id: ev.productId || null,
          type: ev.type || "view",
          ts: ev.ts || new Date().toISOString(),
          session_id: ev.sessionId || null,
        };
        const { error } = await supabase.from("interactions").insert(row);
        if (error) throw error;
        return row;
      },
    },

    cart: {
      async list(userId) {
        const { data, error } = await supabase
          .from("cart_items")
          .select("product_id, quantity, added_at")
          .eq("user_id", userId)
          .order("added_at");
        if (error) throw error;
        return (data || []).map((r) => ({
          productId: r.product_id,
          quantity: r.quantity,
          addedAt: r.added_at,
        }));
      },
      async add(userId, productId, quantity = 1) {
        // Fetch existing quantity
        const { data: existing } = await supabase
          .from("cart_items")
          .select("quantity")
          .eq("user_id", userId)
          .eq("product_id", productId)
          .maybeSingle();

        const newQty = (existing ? existing.quantity : 0) + quantity;
        const { error } = await supabase.from("cart_items").upsert({
          user_id: userId,
          product_id: productId,
          quantity: newQty,
          added_at: new Date().toISOString(),
        });
        if (error) throw error;
        return newQty;
      },
      async setQuantity(userId, productId, quantity) {
        const { error } = await supabase
          .from("cart_items")
          .update({ quantity })
          .eq("user_id", userId)
          .eq("product_id", productId);
        if (error) throw error;
        return true;
      },
      async remove(userId, productId) {
        const { error } = await supabase
          .from("cart_items")
          .delete()
          .eq("user_id", userId)
          .eq("product_id", productId);
        if (error) throw error;
        return true;
      },
      async clear(userId) {
        const { error } = await supabase.from("cart_items").delete().eq("user_id", userId);
        if (error) throw error;
        return true;
      },
      async count(userId) {
        const { data, error } = await supabase
          .from("cart_items")
          .select("quantity")
          .eq("user_id", userId);
        if (error) throw error;
        return (data || []).reduce((acc, r) => acc + (r.quantity || 0), 0);
      },
    },

    orders: {
      async create(order, items) {
        const orderRow = {
          id: order.id,
          user_id: order.userId,
          status: order.status || "pending",
          total: order.total,
          currency: order.currency || "INR",
          item_count: order.itemCount,
          created_at: order.createdAt || new Date().toISOString(),
        };

        const { error: orderErr } = await supabase.from("orders").insert(orderRow);
        if (orderErr) throw orderErr;

        const itemRows = items.map((it) => ({
          order_id: order.id,
          product_id: it.productId,
          title: it.title || null,
          price: it.price,
          quantity: it.quantity,
        }));

        const { error: itemsErr } = await supabase.from("order_items").insert(itemRows);
        if (itemsErr) throw itemsErr;

        return order.id;
      },
      async get(id) {
        const { data, error } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
        if (error) throw error;
        return data;
      },
      async items(orderId) {
        const { data, error } = await supabase.from("order_items").select("*").eq("order_id", orderId);
        if (error) throw error;
        return data || [];
      },
      async listByUser(userId) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data || [];
      },
      async listAll(limit = 100) {
        const { data, error } = await supabase
          .from("orders")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        return data || [];
      },
      async updateStatus(id, status) {
        const { error } = await supabase.from("orders").update({ status }).eq("id", id);
        if (error) throw error;
        return true;
      },
    },

    events: {
      async insert(ev) {
        const row = {
          user_id: ev.userId || null,
          product_id: ev.productId || null,
          type: ev.type || "view",
          session_id: ev.sessionId || null,
          ts: ev.ts || new Date().toISOString(),
        };
        const { error } = await supabase.from("events").insert(row);
        if (error) throw error;
      },
      async count() {
        const { count, error } = await supabase.from("events").select("*", { count: "exact", head: true });
        if (error) throw error;
        return count || 0;
      },
      async popularProducts(limit = 10) {
        const { data, error } = await supabase
          .from("events")
          .select("product_id")
          .not("product_id", "is", null)
          .limit(1000);
        if (error) throw error;
        const counts = new Map();
        for (const row of data || []) {
          counts.set(row.product_id, (counts.get(row.product_id) || 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([productId, count]) => ({ productId, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },
    },

    searchLogs: {
      async insert(log) {
        const row = {
          query: log.query || "",
          total: log.total == null ? null : log.total,
          clicked_product_id: log.clickedId || null,
          ts: log.ts || new Date().toISOString(),
        };
        const { error } = await supabase.from("search_logs").insert(row);
        if (error) throw error;
      },
      async count() {
        const { count, error } = await supabase.from("search_logs").select("*", { count: "exact", head: true });
        if (error) throw error;
        return count || 0;
      },
      async zeroResultCount() {
        const { count, error } = await supabase
          .from("search_logs")
          .select("*", { count: "exact", head: true })
          .eq("total", 0);
        if (error) throw error;
        return count || 0;
      },
      async topQueries(limit = 10) {
        const { data, error } = await supabase
          .from("search_logs")
          .select("query")
          .neq("query", "")
          .limit(1000);
        if (error) throw error;
        const counts = new Map();
        for (const row of data || []) {
          counts.set(row.query, (counts.get(row.query) || 0) + 1);
        }
        return Array.from(counts.entries())
          .map(([query, count]) => ({ query, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);
      },
    },

    searchHistory: {
      async add(userId, query, total) {
        const row = {
          user_id: userId,
          query: query || "",
          total: total == null ? null : total,
          ts: new Date().toISOString(),
        };
        const { error } = await supabase.from("search_history").insert(row);
        if (error) throw error;
      },
      async recent(userId, limit = 10) {
        const { data, error } = await supabase
          .from("search_history")
          .select("query, ts")
          .eq("user_id", userId)
          .order("id", { ascending: false })
          .limit(limit * 4);
        if (error) throw error;
        const seen = new Set();
        const out = [];
        for (const r of data || []) {
          const q = (r.query || "").trim();
          if (!q || seen.has(q.toLowerCase())) continue;
          seen.add(q.toLowerCase());
          out.push({ query: q, ts: r.ts });
          if (out.length >= limit) break;
        }
        return out;
      },
      async count(userId) {
        const { count, error } = await supabase
          .from("search_history")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId);
        if (error) throw error;
        return count || 0;
      },
    },
  };
}

module.exports = { createSupabaseRepo };
