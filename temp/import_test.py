import sys
sys.path.append(r'd:\Crew_control\ai-service')
try:
    from pipeline.tables.cell_extractor import CellExtractor
    print('import_ok')
except Exception as e:
    print('import_err', e)
