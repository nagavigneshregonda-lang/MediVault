const { errorResponse } = require('../utils/response');

function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied. Role '${req.user.role}' is not authorized to perform this action.`,
        403
      );
    }

    next();
  };
}

module.exports = {
  authorizeRoles
};

