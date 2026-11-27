// The Inertia response of The Boring JavaScript Stack.
module.exports = function inertia(data) {
  return this.req._sails.inertia.render(this.req, this.res, data);
};
