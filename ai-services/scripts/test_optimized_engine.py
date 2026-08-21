import sys, os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from pipeline.table_engine_optimized import optimized_extract_table_engine
from schema import TimesheetFormat
res = optimized_extract_table_engine('backend/src/storage/uploads/timesheets/1782294444184-Alqaser__Alsatea_Tech_Cont__260623_182237.pdf', TimesheetFormat.GENERIC, False, config_overrides=None, request_cache={})
print('RESULT KEYS:', type(res), len(res) if hasattr(res,'__len__') else '')
print(res)
