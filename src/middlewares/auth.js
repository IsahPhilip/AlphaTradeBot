'use strict';

function requireAdmin(adminIds = []) {
  const allowed = new Set(adminIds.map((id) => Number.parseInt(id, 10)).filter(Number.isInteger));

  return (ctx, next) => {
    const userId = ctx?.from?.id;

    if (!allowed.size || allowed.has(userId)) {
      return next();
    }

    return ctx.reply('Unauthorized. Admin access required.');
  };
}

module.exports = {
  requireAdmin
};
