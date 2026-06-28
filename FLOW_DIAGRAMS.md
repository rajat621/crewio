# DETAILED FLOW DIAGRAMS

This document contains comprehensive Mermaid diagrams showing actual execution flow, business logic, template rendering, and OCR routing.

---

## DIAGRAM A: COMPLETE REQUEST → RESPONSE FLOW

Shows the full path from API request through extraction, rendering, and response.

```mermaid
flowchart TD
    subgraph API["API Layer"]
        A1["POST /generate-invoice or /upload"]
        A2["Parse request body:<br/>pdf_path, company_data, template_path,<br/>signature_path, stamp_path"]
    end
    
    subgraph Extract["Extraction Pipeline (Python)"]
        E1["pipeline/run.py:<br/>run_extraction()"]
        E2["pipeline/classifier.py:<br/>classify_pdf() → Format, Layout"]
        E3{OCR Needed?}
        E4["pdfplumber:<br/>extract_text_pdf()"]
        E5["RapidOCR:<br/>_extract_table_engine()"]
        E6["compute_vat():<br/>Add VAT to each row"]
        E7["Return ExtractionResult:<br/>rows[], financials{}"]
    end
    
    subgraph Render["Rendering Pipeline (Python)"]
        R1["pdf_writer.py:<br/>generate_invoice_pdf()"]
        R2["Resolve Assets:<br/>template_path, signature, stamp"]
        R3["TemplateLoader:<br/>Load PDF → PNG pages"]
        R4["TemplateAnalyzer:<br/>Detect header/footer/logo regions"]
        R5["SafeZoneDetector:<br/>Compute content bounds"]
        R6["DynamicLayoutEngine:<br/>render()"]
        R6A["normalize_rows():<br/>Apply business aggregation"]
        R6B["PaginationEngine:<br/>Split into page chunks"]
        R6C["For each page:<br/>BackgroundRenderer + _draw_*()"]
        R7["Canvas.save():<br/>Write PDF file"]
    end
    
    subgraph Backend["Backend Layer"]
        B1["ai.controller.js<br/>or invoice.controller.js"]
        B2["Python subprocess call:<br/>main.py"]
        B3["Collect response:<br/>invoice_path, result"]
        B4["Update Invoice record<br/>in MongoDB"]
    end
    
    subgraph Response["Response"]
        RS["Return JSON:<br/>{ success: true,<br/>invoice_path: '...',<br/>result: {...} }"]
    end
    
    A1 --> A2
    A2 --> B1
    B1 --> B2
    B2 --> E1
    E1 --> E2
    E2 --> E3
    E3 -->|No| E4
    E3 -->|Yes| E5
    E4 --> E6
    E5 --> E6
    E6 --> E7
    E7 --> B2
    B2 --> R1
    R1 --> R2
    R2 --> R3
    R3 --> R4
    R4 --> R5
    R5 --> R6
    R6 --> R6A
    R6A --> R6B
    R6B --> R6C
    R6C --> R7
    R7 --> B3
    B3 --> B4
    B4 --> RS
    RS --> A1
```

---

## DIAGRAM B: BUSINESS NORMALIZATION FLOW

Shows how extraction rows are transformed by business rules (conditional aggregation).

```mermaid
flowchart TD
    subgraph Input["Input: ExtractionResult.rows"]
        I1["Row 1: trade=STEEL FIXER,<br/>project_id=P1506,<br/>hours=40, amount=2000"]
        I2["Row 2: trade=STEEL FIXER,<br/>project_id=P960,<br/>hours=35, amount=1750"]
        I3["Row 3: trade=MASON,<br/>project_id=null,<br/>hours=30, amount=1350"]
        I4["Row 4: trade=MASON,<br/>project_id=null,<br/>hours=25, amount=1125"]
        I5["Row 5: trade=MASON,<br/>project_id=null,<br/>hours=10, amount=450"]
    end
    
    subgraph Normalize["normalize_rows() Logic"]
        N1["For each row:<br/>IF project_id NOT NULL:<br/>key = trade, project_id<br/>ELSE:<br/>key = trade, None"]
        N2["Group rows by key"]
        N3["Aggregate:<br/>hours = SUM()<br/>amount = SUM()<br/>deductions = SUM()<br/>overtime = SUM()"]
    end
    
    subgraph Process["Processing Steps"]
        P1["STEEL FIXER + P1506<br/>→ hours: 40<br/>→ amount: 2000"]
        P2["STEEL FIXER + P960<br/>→ hours: 35<br/>→ amount: 1750"]
        P3["MASON + None<br/>→ hours: 30+25+10=65<br/>→ amount: 1350+1125+450=2925"]
    end
    
    subgraph Output["Output: Normalized Rows"]
        O1["Row 1: STEEL FIXER, P1506,<br/>hours=40, amount=2000"]
        O2["Row 2: STEEL FIXER, P960,<br/>hours=35, amount=1750"]
        O3["Row 3: MASON, None,<br/>hours=65, amount=2925"]
    end
    
    I1 --> N1
    I2 --> N1
    I3 --> N1
    I4 --> N1
    I5 --> N1
    N1 --> N2
    N2 --> N3
    N3 --> P1
    N3 --> P2
    N3 --> P3
    P1 --> O1
    P2 --> O2
    P3 --> O3
```

---

## DIAGRAM C: TEMPLATE ANALYSIS & SAFE-ZONE DETECTION

Shows how templates are analyzed for branding regions and safe content area computed.

```mermaid
flowchart TD
    subgraph Input["Input: Template PDF"]
        I1["File: template.pdf"]
    end
    
    subgraph Load["TemplateLoader"]
        L1["Load PDF → PIL Image<br/>at 200 DPI"]
        L2["Convert to NumPy array<br/>BGR color space"]
    end
    
    subgraph Analyze["TemplateAnalyzer.analyze()"]
        A1["Preprocessing:<br/>Grayscale + Blur"]
        A2["Whitespace Projection:<br/>row_dark, col_dark"]
        A3["Find Transitions:<br/>header_bottom,<br/>footer_top"]
        A4["Density Analysis:<br/>Find logo regions,<br/>watermark regions"]
        A5["Return TemplateAnalysis:<br/>{ header_bottom_px,<br/>footer_top_px,<br/>logo_regions[],<br/>watermark_regions[] }"]
    end
    
    subgraph SafeZone["SafeZoneDetector.detect()"]
        SZ1["Input: TemplateAnalysis,<br/>image_shape"]
        SZ2["content_top = header_bottom + 10px<br/>(margin)"]
        SZ3["content_bottom = footer_top - 10px<br/>(margin)"]
        SZ4["content_left = max(logo region)<br/>+ 10px margin"]
        SZ5["content_right = min(page_width,<br/>min(logo region) - 10px)"]
        SZ6["Return SafeZone:<br/>{ content_top_px,<br/>content_bottom_px,<br/>content_left_px,<br/>content_right_px }"]
    end
    
    subgraph Convert["Scale to Points"]
        C1["scale_y = 841.89 / image_height_px"]
        C2["content_top_pts =<br/>841.89 - (content_top_px * scale_y)"]
        C3["content_bottom_pts =<br/>841.89 - (content_bottom_px * scale_y)"]
        C4["Return SafeZone in points"]
    end
    
    subgraph Example["Example A4 Template"]
        EX1["Image: 1200×1500 px<br/>scale_y = 841.89/1500 = 0.561"]
        EX2["Header detected at: 150 px<br/>content_top = 150 + 10 = 160 px"]
        EX3["Footer detected at: 1410 px<br/>content_bottom = 1410 - 10 = 1400 px"]
        EX4["Pixel coords:<br/>{ top: 160, bottom: 1400 }"]
        EX5["Point coords:<br/>{ top: 841.89 - 89.76 = 752.13 pts,<br/>bottom: 841.89 - 785.4 = 56.49 pts }"]
    end
    
    I1 --> L1
    L1 --> L2
    L2 --> A1
    A1 --> A2
    A2 --> A3
    A3 --> A4
    A4 --> A5
    A5 --> SZ1
    SZ1 --> SZ2
    SZ2 --> SZ3
    SZ3 --> SZ4
    SZ4 --> SZ5
    SZ5 --> SZ6
    SZ6 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> EX1
    EX1 --> EX2
    EX2 --> EX3
    EX3 --> EX4
    EX4 --> EX5
```

---

## DIAGRAM D: PAGINATION & LAYOUT RENDERING

Shows how content is split into pages and rendered with proper positioning.

```mermaid
flowchart TD
    subgraph Input["Input to DynamicLayoutEngine"]
        I1["ExtractionResult with 100 rows"]
        I2["SafeZone bounds (in points)"]
        I3["TemplateAsset (PDF pages)"]
        I4["Client details, owner profile"]
    end
    
    subgraph Normalize["normalize_rows()"]
        N1["Apply business aggregation<br/>→ ~65-70 unique rows"]
    end
    
    subgraph Paginate["PaginationEngine.paginate()"]
        P1["Calculate available height:<br/>content_top - content_bottom = 695.64 pts"]
        P2["Calculate max_rows_per_page:<br/>(695.64 - 120 reserved - 30 header) / 22<br/>= ~25 rows"]
        P3["Split into chunks:<br/>Pages = [25, 25, 15, remaining]"]
    end
    
    subgraph Layout["ContentPositioner.compute()"]
        L1["Invoice title Y = content_top - 20"]
        L2["Client block Y = content_top - 50"]
        L3["Table header Y = content_top - 80"]
        L4["First row Y = content_top - 110"]
        L5["Rows drawn downward:<br/>y -= 22 per row"]
        L6["Carry-forward total<br/>drawn at y -= (num_rows * 22)"]
        L7["Return ContentPositions"]
    end
    
    subgraph RenderPage["For each page in PaginationEngine"]
        RP1["Page 1-3: Intermediate"]
        RP2["Page N: Final"]
    end
    
    subgraph DrawInter["_draw_intermediate_page()"]
        DI1["BackgroundRenderer.draw_background()<br/>→ Template background"]
        DI2["_draw_header()<br/>→ Title, page number, meta"]
        DI3["_draw_client_block()<br/>→ Bill To details"]
        DI4["_draw_table()<br/>→ Headers + rows"]
        DI5["_draw_carry_forward()<br/>→ Running total"]
        DI6["Canvas.showPage()"]
    end
    
    subgraph DrawFinal["_draw_final_page()"]
        DF1["(same as intermediate)"]
        DF2["_draw_totals()<br/>→ Subtotal, VAT,<br/>deductions, net"]
        DF3["_draw_signature_block()<br/>→ Signature, stamp,<br/>thanks text"]
        DF4["Canvas.showPage()"]
    end
    
    subgraph Output["Output"]
        O1["Completed PDF file<br/>with N pages"]
    end
    
    I1 --> Normalize
    I2 --> Paginate
    I3 --> RenderPage
    I4 --> DrawInter
    Normalize --> Paginate
    Paginate --> Layout
    Layout --> RenderPage
    RenderPage --> RP1
    RenderPage --> RP2
    RP1 --> DrawInter
    RP2 --> DrawFinal
    DrawInter --> DI1
    DI1 --> DI2
    DI2 --> DI3
    DI3 --> DI4
    DI4 --> DI5
    DI5 --> DI6
    DI6 --> O1
    DrawFinal --> DF1
    DF1 --> DF2
    DF2 --> DF3
    DF3 --> DF4
    DF4 --> O1
```

---

## DIAGRAM E: OCR ROUTING DECISION TREE

Shows how the system intelligently routes between pdfplumber and RapidOCR.

```mermaid
flowchart TD
    subgraph Start["Input: PDF File"]
        S1["pdf_path"]
    end
    
    subgraph Classify["Classify PDF"]
        C1["pipeline/classifier.py:<br/>classify_pdf()"]
        C2["→ format: TimesheetFormat<br/>→ layout: LayoutType<br/>→ is_image: bool"]
    end
    
    subgraph Decision["text_extractor.py:<br/>_should_use_ocr_pipeline()"]
        D1["Step 1: Extract text<br/>using pdfplumber"]
        D2{"Check: text_volume<br/>&lt; 700 chars?"}
        D3{"Check: attachment_heavy<br/>AND no_rows?<br/>tokens ≥ 20"}
        D4{"Check: format in BKC/GENERIC<br/>AND no_rows?"}
        D5["Return: use_ocr = FALSE<br/>→ Use pdfplumber"]
        D6["Return: use_ocr = TRUE<br/>→ Use RapidOCR"]
    end
    
    subgraph pdfplumber["pdfplumber Route"]
        PDF1["Extract text-based table:<br/>_extract_pdf_text_tables()"]
        PDF2["Clean column alignment"]
        PDF3["Parse rows into:<br/>trade, project_id, hours, etc."]
    end
    
    subgraph RapidOCR["RapidOCR Route"]
        OCR1["Convert PDF pages to images<br/>pdf2image @ 200 DPI"]
        OCR2["Detect tables via morphology:<br/>table_detector.py"]
        OCR3["Extract OCR + grid structure:<br/>_extract_table_engine()"]
        OCR4["Reconstruct grid:<br/>grid_reconstructor.py"]
        OCR5["Normalize cells:<br/>table_normalizer.py"]
    end
    
    subgraph Common["Common Processing"]
        COMM1["normalize_rows():<br/>Group by (trade, project_id)"]
        COMM2["compute_vat():<br/>Apply VAT rate"]
        COMM3["Return ExtractionResult"]
    end
    
    subgraph TestCases["Test Coverage"]
        TC1["✅ Clean Text (1328 chars)<br/>→ pdfplumber"]
        TC2["✅ Low Text (24 chars)<br/>→ OCR"]
        TC3["✅ Attendance-Heavy (47 tokens)<br/>→ OCR"]
        TC4["✅ BKC Format (no rows)<br/>→ OCR"]
        TC5["✅ MCC Format (rows)<br/>→ pdfplumber"]
    end
    
    S1 --> C1
    C1 --> C2
    C2 --> D1
    D1 --> D2
    D2 -->|Yes (<700)| D6
    D2 -->|No| D3
    D3 -->|Yes| D6
    D3 -->|No| D4
    D4 -->|Yes| D6
    D4 -->|No| D5
    D5 --> PDF1
    D6 --> OCR1
    PDF1 --> PDF2
    PDF2 --> PDF3
    PDF3 --> COMM1
    OCR1 --> OCR2
    OCR2 --> OCR3
    OCR3 --> OCR4
    OCR4 --> OCR5
    OCR5 --> COMM1
    COMM1 --> COMM2
    COMM2 --> COMM3
    COMM3 --> TC1
    COMM3 --> TC2
    COMM3 --> TC3
    COMM3 --> TC4
    COMM3 --> TC5
```

---

## DIAGRAM F: COORDINATE SYSTEM TRANSFORMATION

Shows the critical coordinate system conversion between OpenCV (template analysis) and ReportLab (rendering).

```mermaid
flowchart TD
    subgraph OpenCV["OpenCV/PIL Coordinate System<br/>(Template Analysis)"]
        OCV1["Origin: Top-Left (0,0)"]
        OCV2["Y increases downward ↓"]
        OCV3["Image dimensions: width_px × height_px"]
        OCV4["Example: header_bottom = 150 px"]
        OCV5["Example: footer_top = 1410 px"]
    end
    
    subgraph ReportLab["ReportLab Coordinate System<br/>(PDF Canvas)"]
        RL1["Origin: Bottom-Left (0,0)"]
        RL2["Y increases upward ↑"]
        RL3["Page dimensions: width_pts × height_pts"]
        RL4["A4 Page: 595.28 × 841.89 pts"]
    end
    
    subgraph Conversion["Conversion Formula"]
        CONV1["Scale factor (Y axis):<br/>scale_y = page_height_pts / image_height_px"]
        CONV2["For A4 Template (1500 px height):<br/>scale_y = 841.89 / 1500 = 0.561"]
        CONV3["Convert pixel Y to point Y:<br/>y_pts = page_height_pts - (y_px * scale_y)"]
        CONV4["Example: header_bottom_px = 150<br/>y_pts = 841.89 - (150 * 0.561)<br/>= 841.89 - 84.15 = 757.74 pts"]
    end
    
    subgraph SafeZoneConversion["Safe Zone Conversion"]
        SZ1["Pixel coords (from TemplateAnalyzer):<br/>content_top_px = 160<br/>content_bottom_px = 1400"]
        SZ2["Convert to points:<br/>content_top_pts = 841.89 - (160 * 0.561)<br/>= 841.89 - 89.76 = 752.13 pts<br/>content_bottom_pts = 841.89 - (1400 * 0.561)<br/>= 841.89 - 785.4 = 56.49 pts"]
        SZ3["Verification:<br/>Available height = 752.13 - 56.49 = 695.64 pts ✓"]
    end
    
    subgraph DrawingDirection["Drawing Direction (ReportLab)"]
        DD1["In ReportLab, text/shapes are<br/>drawn at (x, y) where y is upward"]
        DD2["To place content from top downward:<br/>Start at y = safe_zone_top - margin"]
        DD3["Draw next row at y -= row_height"]
        DD4["This appears downward on page"]
        DD5["Example:<br/>invoice_title_y = 752.13 - 20 = 732.13<br/>client_block_y = 732.13 - 50 = 682.13<br/>table_row_1_y = 682.13 - 110 = 572.13<br/>table_row_2_y = 572.13 - 22 = 550.13"]
    end
    
    OCV1 --> CONV1
    OCV2 --> CONV1
    OCV3 --> CONV1
    OCV4 --> CONV1
    OCV5 --> CONV1
    RL1 --> CONV1
    RL2 --> CONV1
    RL3 --> CONV1
    RL4 --> CONV1
    CONV1 --> CONV2
    CONV2 --> CONV3
    CONV3 --> CONV4
    CONV4 --> SZ1
    SZ1 --> SZ2
    SZ2 --> SZ3
    SZ3 --> DD1
    DD1 --> DD2
    DD2 --> DD3
    DD3 --> DD4
    DD4 --> DD5
```

---

## DIAGRAM G: MULTI-PAGE TEMPLATE RENDERING

Shows how template branding is preserved and content split across multiple pages.

```mermaid
flowchart TD
    subgraph Input["Input"]
        I1["100 normalized rows"]
        I2["Template with branding<br/>on all pages"]
        I3["Multi-page asset:<br/>page_images[0..N]"]
    end
    
    subgraph Pagination["Pagination"]
        P1["Max rows per page = 19"]
        P2["Split 100 rows into pages:<br/>Page 1: rows 1-19<br/>Page 2: rows 20-38<br/>Page 3: rows 39-57<br/>Page 4: rows 58-76<br/>Page 5: rows 77-95<br/>Page 6: rows 96-100"]
        P3["Calculate carry-forward totals:<br/>Page 1: 0<br/>Page 2: sum(page 1) = X<br/>Page 3: sum(page 1-2) = Y"]
    end
    
    subgraph RenderLoop["Render Loop: For Each Page"]
        RL1["canvas = Canvas()"]
        RL2["page_index = current page number"]
        RL3["BackgroundRenderer.draw_background()<br/>→ template.page_images[page_index]<br/>→ Preserves all branding"]
        RL4["_draw_header()<br/>→ Title, page number"]
        RL5["_draw_client_block()<br/>→ Bill To (on all pages)"]
        RL6["_draw_table()<br/>→ Rows for this page"]
        RL7{"Last page?"}
        RL8["_draw_carry_forward()<br/>→ Running total"]
        RL9["_draw_totals()<br/>→ Subtotal + VAT + deductions"]
        RL10["_draw_signature_block()<br/>→ Signature, stamp"]
        RL11["canvas.showPage()"]
    end
    
    subgraph PerPageBehavior["Per-Page Behavior"]
        PPB1["Page 1-5 (Intermediate):<br/>Header + Client + Rows + Carry-Forward"]
        PPB2["Page 6 (Final):<br/>Header + Client + Rows + Totals + Signature"]
        PPB3["All Pages:<br/>Template branding preserved<br/>Owner signature/stamp on each"]
    end
    
    subgraph Output["Output"]
        O1["6-page PDF<br/>with consistent branding<br/>and proper financial totals"]
    end
    
    I1 --> P1
    I2 --> RL3
    I3 --> RL3
    P1 --> P2
    P2 --> P3
    P3 --> RL1
    RL1 --> RL2
    RL2 --> RL3
    RL3 --> RL4
    RL4 --> RL5
    RL5 --> RL6
    RL6 --> RL7
    RL7 -->|No| RL8
    RL7 -->|Yes| RL9
    RL8 --> RL11
    RL9 --> RL10
    RL10 --> RL11
    RL11 --> PPB1
    RL11 --> PPB2
    RL11 --> PPB3
    PPB1 --> O1
    PPB2 --> O1
    PPB3 --> O1
```

---

End of Flow Diagrams
