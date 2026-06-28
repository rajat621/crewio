import sys
sys.path.insert(0, r'd:\Crew_control\ai-service')
try:
    from pipeline.table_engine_optimized import optimized_extract_table_engine
    print('import_ok')
except Exception as e:
    print('import_failed', repr(e))
    raise
