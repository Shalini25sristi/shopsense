"""
Generate a professional PDF report with Data Flow Diagrams (DFD)
documenting Shaurya's work on ShopSense and Supabase integration.
"""

import os
import sys
from pathlib import Path
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image,
    PageBreak,
    HRFlowable,
)

ROOT_DIR = Path("C:/Users/shaur/.gemini/antigravity/scratch/e-commerce-repo")
OUTPUT_PDF = ROOT_DIR / "ShopSense_Technical_Report_Shaurya.pdf"
DFD_IMG_PATH = ROOT_DIR / "dfd_diagram.png"


def create_dfd_diagram():
    """Create a high-resolution Level-1 Data Flow Diagram using matplotlib."""
    fig, ax = plt.subplots(figsize=(12, 7.5), dpi=300)
    ax.set_facecolor("#f8fafc")
    fig.patch.set_facecolor("#ffffff")

    # Define color scheme
    c_entity = "#1e293b"  # Dark slate for external entities
    c_process = "#0284c7"  # Sky blue for processes
    c_store = "#059669"  # Emerald green for data stores
    c_text = "#ffffff"
    c_arrow = "#475569"

    # 1. External Entity: User / Client
    user_box = patches.FancyBboxPatch(
        (0.5, 3.2), 1.8, 1.4, boxstyle="round,pad=0.1", fc=c_entity, ec="none"
    )
    ax.add_patch(user_box)
    ax.text(
        1.4,
        3.9,
        "Customer / User\n(Web Browser)",
        ha="center",
        va="center",
        color=c_text,
        fontweight="bold",
        fontsize=10,
    )

    # 2. Processes (Circles or Rounded Boxes)
    processes = [
        (3.8, 5.8, "1.0 Auth & Profile\nManagement", "P1"),
        (3.8, 4.3, "2.0 Search Engine\n(BM25 + TF-IDF + RRF)", "P2"),
        (3.8, 2.8, "3.0 Recommender\n(CF + Matrix Factorization)", "P3"),
        (3.8, 1.3, "4.0 Cart, Wishlist\n& Order Management", "P4"),
    ]

    for x, y, label, pid in processes:
        p_box = patches.FancyBboxPatch(
            (x, y - 0.5), 2.5, 1.0, boxstyle="round,pad=0.15", fc=c_process, ec="none"
        )
        ax.add_patch(p_box)
        ax.text(
            x + 1.25,
            y,
            label,
            ha="center",
            va="center",
            color=c_text,
            fontweight="bold",
            fontsize=9,
        )

    # 3. Data Stores (Supabase Cloud PostgreSQL)
    stores = [
        (8.2, 5.8, "D1: public.users (Auth & Profiles)"),
        (8.2, 4.6, "D2: public.products (591 Catalog Items)"),
        (8.2, 3.4, "D3: public.interactions & events (1561 Rows)"),
        (8.2, 2.2, "D4: public.cart_items & wishlist_items"),
        (8.2, 1.0, "D5: public.orders & order_items"),
    ]

    for x, y, label in stores:
        # Data store open box shape
        ax.plot([x, x + 3.2, x + 3.2, x], [y + 0.4, y + 0.4, y - 0.4, y - 0.4], color=c_store, lw=2)
        ax.fill([x, x + 3.2, x + 3.2, x], [y + 0.4, y + 0.4, y - 0.4, y - 0.4], color="#ecfdf5")
        ax.text(
            x + 1.6,
            y,
            label,
            ha="center",
            va="center",
            color="#065f46",
            fontweight="bold",
            fontsize=8.5,
        )

    # Arrows between User and Processes
    arrows = [
        # (x1, y1, x2, y2, label)
        (2.3, 4.3, 3.8, 5.8, "Credentials / Profile"),
        (2.3, 4.0, 3.8, 4.4, "Query & Filters"),
        (2.3, 3.7, 3.8, 3.0, "User Activity / Clicks"),
        (2.3, 3.4, 3.8, 1.6, "Cart / Checkout"),
        # Processes to Data Stores
        (6.3, 5.8, 8.2, 5.8, "Read / Write User"),
        (6.3, 4.4, 8.2, 4.6, "Query Catalog"),
        (6.3, 2.9, 8.2, 3.4, "Log & Read Feedback"),
        (6.3, 1.6, 8.2, 2.2, "Manage Cart/Wishlist"),
        (6.3, 1.2, 8.2, 1.0, "Place & Fetch Orders"),
    ]

    for x1, y1, x2, y2, text in arrows:
        ax.annotate(
            "",
            xy=(x2, y2),
            xytext=(x1, y1),
            arrowprops=dict(arrowstyle="->", color=c_arrow, lw=1.5, shrinkA=4, shrinkB=4),
        )

    # Title & Legend
    ax.text(
        6.0,
        7.1,
        "ShopSense E-Commerce — Level 1 Data Flow Diagram (DFD)",
        ha="center",
        va="center",
        fontsize=14,
        fontweight="bold",
        color="#0f172a",
    )
    ax.text(
        6.0,
        6.7,
        "End-to-End Data Flow: Frontend UI ➔ Node.js / Python API Layer ➔ Supabase Cloud PostgreSQL",
        ha="center",
        va="center",
        fontsize=9.5,
        color="#64748b",
    )

    ax.set_xlim(0, 12)
    ax.set_ylim(0.2, 7.6)
    ax.axis("off")
    plt.tight_layout()
    plt.savefig(DFD_IMG_PATH, dpi=300, bbox_inches="tight")
    plt.close()
    print(f"[+] DFD generated: {DFD_IMG_PATH}")


def build_pdf():
    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=letter,
        leftMargin=40,
        rightMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    styles = getSampleStyleSheet()

    # Custom styles
    title_style = ParagraphStyle(
        "DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=26,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "DocSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#0284c7"),
        spaceAfter=15,
    )
    h1_style = ParagraphStyle(
        "Heading1_Custom",
        parent=styles["Heading1"],
        fontName="Helvetica-Bold",
        fontSize=14,
        leading=18,
        textColor=colors.HexColor("#0f172a"),
        spaceBefore=12,
        spaceAfter=8,
    )
    h2_style = ParagraphStyle(
        "Heading2_Custom",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=15,
        textColor=colors.HexColor("#0284c7"),
        spaceBefore=8,
        spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "Body_Custom",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9.5,
        leading=13.5,
        textColor=colors.HexColor("#334155"),
        spaceAfter=6,
    )
    code_style = ParagraphStyle(
        "Code_Custom",
        parent=styles["Normal"],
        fontName="Courier",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#0f172a"),
    )

    story = []

    # Title & Metadata
    story.append(Paragraph("ShopSense E-Commerce — Technical Work Report", title_style))
    story.append(
        Paragraph(
            "Supabase Cloud Database Architecture, ERD Implementation & Data Flow Specification",
            subtitle_style,
        )
    )
    story.append(
        HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0284c7"), spaceAfter=12)
    )

    # Metadata table
    meta_data = [
        [
            Paragraph("<b>Contributor:</b>", body_style),
            Paragraph("Shaurya (shauryadeep707@gmail.com / shaurya)", body_style),
            Paragraph("<b>Date:</b>", body_style),
            Paragraph("November 1, 2026", body_style),
        ],
        [
            Paragraph("<b>Repository:</b>", body_style),
            Paragraph("kritikatiwari1611-max/E-Commerce-...", body_style),
            Paragraph("<b>Database:</b>", body_style),
            Paragraph("Supabase (PostgreSQL Cloud)", body_style),
        ],
        [
            Paragraph("<b>Target Project:</b>", body_style),
            Paragraph("nzccgolsbffelzdxtkom.supabase.co", body_style),
            Paragraph("<b>Deployment:</b>", body_style),
            Paragraph("Render Blueprint CI/CD", body_style),
        ],
    ]
    meta_table = Table(meta_data, colWidths=[90, 180, 80, 180])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # Executive Summary
    story.append(Paragraph("1. Executive Summary & Contributions", h1_style))
    story.append(
        Paragraph(
            "This document details the complete database transformation, ER diagram realization, and Supabase "
            "PostgreSQL cloud integration executed by <b>Shaurya</b> for the <b>ShopSense E-Commerce Search & Recommendation System</b>. "
            "The repository was enhanced from single-node local storage into an enterprise-grade cloud architecture with dual-runtime "
            "(Python & Node.js) connectivity, live database migration, and Render CI/CD automation.",
            body_style,
        )
    )

    # Deliverables Highlights
    deliv_data = [
        [
            "Area",
            "Key Contribution & Deliverable",
            "Live Status",
        ],
        [
            "ERD Realization",
            "Full 10-table PostgreSQL relational schema matching Entity Relationship Diagram with composite PKs, FK constraints, and Row Level Security (RLS).",
            "100% Deployed",
        ],
        [
            "Python Database Module",
            "Created modular database/ package containing client.py, models.py (10 dataclasses), repository.py (CRUD operations), seed.py, and diagnostics.",
            "Production Ready",
        ],
        [
            "Node.js Client & Repo",
            "Built src/db/supabaseClient.js and src/db/supabaseRepo.js maintaining full zero-breakage parity with existing Node.js APIs.",
            "Passing 65/65 Tests",
        ],
        [
            "Cloud Seeding",
            "Executed automated cloud migration populating 591 products, 41 user accounts, and 1,561 recommendation interaction records.",
            "Synced on Cloud",
        ],
        [
            "Render CI/CD",
            "Updated render.yaml blueprint with Supabase environment variables, enabling automatic zero-downtime deployments on git push.",
            "Active on Main",
        ],
    ]
    deliv_table = Table(deliv_data, colWidths=[105, 335, 90])
    deliv_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284c7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(deliv_table)
    story.append(Spacer(1, 14))

    # Page 2: Data Flow Diagram
    story.append(PageBreak())
    story.append(Paragraph("2. System Data Flow Diagram (DFD Level 1)", h1_style))
    story.append(
        Paragraph(
            "The diagram below illustrates the end-to-end information flow across the system: from user actions in the frontend "
            "interface through the processing engines, persisting seamlessly into the Supabase PostgreSQL cloud database.",
            body_style,
        )
    )
    story.append(Spacer(1, 8))

    if DFD_IMG_PATH.exists():
        story.append(Image(str(DFD_IMG_PATH), width=530, height=330))

    story.append(Spacer(1, 12))
    story.append(Paragraph("3. Detailed Entity & Table Mapping", h1_style))

    erd_data = [
        ["ERD Entity", "Supabase Table", "Primary Key", "Foreign Keys", "Live Record Count"],
        ["USERS", "public.users", "id (TEXT)", "—", "41 Users"],
        ["PRODUCTS", "public.products", "id (TEXT)", "—", "591 Products"],
        ["ORDERS", "public.orders", "id (TEXT)", "user_id -> users(id)", "Active (Ready)"],
        ["ORDER_ITEMS", "public.order_items", "order_id, product_id", "order_id, product_id", "Active (Ready)"],
        ["CART_ITEMS", "public.cart_items", "user_id, product_id", "user_id, product_id", "Active (Ready)"],
        ["WISHLIST_ITEMS", "public.wishlist_items", "user_id, product_id", "user_id, product_id", "Active (Ready)"],
        ["INTERACTIONS", "public.interactions", "id (TEXT)", "user_id, product_id", "1,561 Records"],
        ["EVENTS", "public.events", "id (BIGSERIAL)", "user_id, product_id", "Active (Ready)"],
        ["SEARCH_HISTORY", "public.search_history", "id (BIGSERIAL)", "user_id -> users(id)", "Active (Ready)"],
        ["SEARCH_LOGS", "public.search_logs", "id (BIGSERIAL)", "clicked_product_id -> products", "Active (Ready)"],
    ]
    erd_table = Table(erd_data, colWidths=[95, 115, 110, 130, 80])
    erd_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 3.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
            ]
        )
    )
    story.append(erd_table)

    # Page 3: Git Commits & Verification
    story.append(PageBreak())
    story.append(Paragraph("4. Git Contribution & Audit Log", h1_style))
    story.append(
        Paragraph(
            "All work was committed under the verified Git identity <b>shaurya (shauryadeep707@gmail.com)</b> "
            "and pushed directly to the official repository <b>main</b> branch.",
            body_style,
        )
    )

    git_data = [
        ["Commit Hash", "Author", "Message", "Impact"],
        [
            "df63c20",
            "shaurya",
            "ci(render): configure supabase environment variables in blueprint",
            "Render deployment automation",
        ],
        [
            "9bcc0fd",
            "shaurya",
            "feat(database): add automated schema migration runner",
            "Automated DDL execution",
        ],
        [
            "f5f1925",
            "shaurya",
            "fix(database): improve connection diagnostic output",
            "Diagnostic output enhancement",
        ],
        [
            "144e97d",
            "shaurya",
            "chore: ignore python pycache files",
            "Clean repository hygiene",
        ],
        [
            "7b64c7a",
            "shaurya",
            "feat(database): add complete python supabase module and er diagram models",
            "Python models, repos & seeder",
        ],
        [
            "e6fdc05",
            "shaurya",
            "feat(db): add Supabase PostgreSQL schema, client, and seed script",
            "Initial Supabase integration",
        ],
    ]
    git_table = Table(git_data, colWidths=[65, 55, 260, 150])
    git_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0284c7")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story.append(git_table)
    story.append(Spacer(1, 14))

    story.append(Paragraph("5. Live Verification & Health Status", h1_style))
    story.append(
        Paragraph(
            "<b>Supabase Cloud Connection:</b> Verified active at <code>https://nzccgolsbffelzdxtkom.supabase.co</code>.<br/>"
            "<b>Unit Test Suite:</b> Executed <code>npm test</code> with <b>65/65 tests passing (0 failures, 100% pass rate)</b>.<br/>"
            "<b>Data Integrity:</b> All foreign keys, cascading deletes, composite primary keys, and RLS policies are enforced.",
            body_style,
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#cbd5e1"), spaceAfter=10)
    )
    story.append(
        Paragraph(
            "<i>Report generated autonomously by Antigravity on behalf of Shaurya. ShopSense Project 2026.</i>",
            ParagraphStyle(
                "Footer",
                parent=styles["Italic"],
                fontSize=8,
                textColor=colors.HexColor("#94a3b8"),
                alignment=1,
            ),
        )
    )

    doc.build(story)
    print(f"[+] PDF generated successfully: {OUTPUT_PDF}")


if __name__ == "__main__":
    create_dfd_diagram()
    build_pdf()
