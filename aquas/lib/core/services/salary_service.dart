import 'package:dio/dio.dart';
import '../network/api_client.dart';
import '../../data/models/mobile_models.dart';

class SalaryService {
  final ApiClient apiClient;

  SalaryService({required this.apiClient});

  Future<List<SalarySlipModel>> getSalarySlips() async {
    try {
      final response = await apiClient.get('/api/salary-slips');
      final List data = response.data['salarySlips'] as List? ?? [];
      return data.map((e) => SalarySlipModel.fromJson(e as Map<String, dynamic>)).toList();
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  Future<SalarySlipModel> getSalarySlip(String id) async {
    try {
      final response = await apiClient.get('/api/salary-slips/$id');
      return SalarySlipModel.fromJson(response.data['salarySlip'] as Map<String, dynamic>);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  /// Returns every 'advance' deduction pulled from this employee's own
  /// finalized salary slips, plus the running total.
  Future<({double total, List<AdvanceEntry> advances})> getAdvances() async {
    try {
      final response = await apiClient.get('/api/salary-slips/advances');
      final data = response.data['data'] as Map<String, dynamic>;
      final list = (data['advances'] as List? ?? [])
          .map((e) => AdvanceEntry.fromJson(e as Map<String, dynamic>))
          .toList();
      final total = (data['totalAdvances'] as num?)?.toDouble() ?? 0;
      return (total: total, advances: list);
    } on DioException catch (e) {
      throw _message(e);
    }
  }

  String _message(DioException error) {
    final data = error.response?.data;
    return (data is Map ? data['message'] : null)?.toString() ??
        error.message ??
        'Something went wrong. Please try again.';
  }
}
