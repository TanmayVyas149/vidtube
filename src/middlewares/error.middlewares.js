import { ApiError } from '../utils/ApiError.js';
import mongoose from 'mongoose';

const errorHandler = (err, req, res, next) => {
  let customError = err;

  // If the error is not an instance of ApiError, convert it
  if (!(customError instanceof ApiError)) {
    const statusCode = err.statusCode || (err instanceof mongoose.Error ? 400 : 500);
    const message = err.message || "Something went wrong";
    const errors = err.errors || [];

    customError = new ApiError(statusCode, message, errors, err.stack);
  }

  // Prepare the response
  const response = {
    success: false,
    message: customError.message,
    ...(process.env.NODE_ENV === 'development' && { stack: customError.stack }),
  };

  // Send the error response
  return res.status(customError.statusCode).json(response);
};

export { errorHandler };
