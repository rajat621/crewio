const errorHandler = (err, req, res, next) => {
  const requestId = req.traceContext?.requestId || null;
  console.error('Error:', requestId ? `[${requestId}]` : '', err);

  const status = err.status || 500;
  // This handler is the last-resort catch-all for exceptions that
  // escaped every controller's own try/catch - confirmed via
  // repository-wide search that no code anywhere sets a custom
  // Error.status or defines a custom error class, so err.message
  // reaching here is always a genuine unhandled internal exception
  // (a raw MongoDB/Mongoose error, a null-pointer bug, a third-party
  // library failure, etc.), never a deliberate, safe application
  // message - there is no legitimate case where the raw message is
  // meant to reach the client at this point in the stack.
  const message = 'Internal Server Error';

  // Additive over the previous {error:{status,message,requestId}} shape -
  // `success` is new, `error.status`/`error.message`/`error.requestId`
  // are all still present so nothing currently reading them breaks.
  res.status(status).json({
    success: false,
    message,
    error: {
      status,
      message,
      requestId,
    },
  });
};

export default errorHandler;


