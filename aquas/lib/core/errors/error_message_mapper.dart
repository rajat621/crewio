// lib/core/errors/error_message_mapper.dart
//
// Single place that turns a caught exception into a message safe to show a
// user. Nothing upstream of this (screens, dialogs) should ever interpolate
// a raw exception into user-facing text - that's how hostnames, status
// codes, and stack traces end up on screen. Everything else should call
// ErrorMessageMapper.toUserMessage(error) and show exactly what comes back.
import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';

class ErrorMessageMapper {
  static String toUserMessage(Object error) {
    if (error is DioException) return _fromDio(error);
    if (error is SocketException) return _noInternet;
    if (error is TimeoutException) return _timeout;
    if (error is FormatException) return _generic;
    return _generic;
  }

  static String _fromDio(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return _timeout;
      case DioExceptionType.connectionError:
        return _noInternet;
      case DioExceptionType.cancel:
        return _generic;
      case DioExceptionType.badResponse:
        return _fromStatusCode(e.response?.statusCode);
      case DioExceptionType.badCertificate:
        return "We couldn't verify a secure connection. Please try again later.";
      case DioExceptionType.unknown:
        // Covers the common `SocketException: Failed host lookup` case,
        // which arrives wrapped inside DioException.unknown rather than as
        // a bare SocketException.
        if (e.error is SocketException) return _noInternet;
        return _generic;
    }
  }

  static String _fromStatusCode(int? code) {
    switch (code) {
      case 400:
        return "That didn't go through. Please check your details and try again.";
      case 401:
        return 'Your session has expired. Please log in again.';
      case 403:
        return "You don't have permission to do that.";
      case 404:
        return "We couldn't find what you're looking for.";
      case 408:
        return _timeout;
      case 429:
        return 'Too many requests. Please wait a moment and try again.';
      case 500:
      case 502:
      case 503:
      case 504:
        return "We're having trouble on our end. Please try again shortly.";
      default:
        return _generic;
    }
  }

  static const _noInternet = 'Please check your internet connection.';
  static const _timeout = 'That took too long. Please try again.';
  static const _generic = 'Something went wrong. Please try again.';
}