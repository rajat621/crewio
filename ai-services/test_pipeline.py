from invoice_pipeline import extract_only, run_pipeline
pdf_path = r"D:\Crew_control\ai-service\timesheets\timesheet3.pdf"

result = extract_only(pdf_path)

print("\n========== EXTRACTION RESULT ==========\n")

print("Success:", result["success"])
print("Rows found:", len(result["rows"]))

print("\nROWS:\n")

for row in result["rows"]:
    print(row)

print("\nTOTALS:\n")
print(result["totals"])

print("\nCLIENT:\n")
print(result["client"])

print("\nMETA:\n")
print(result["timesheet_meta"])