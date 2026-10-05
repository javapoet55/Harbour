// Every machine runs the suite in the Mac's time zone. Set before the workers start, so each one
// inherits it; the matching en-US locale is pinned in jest.setup.js.
module.exports = async () => {
  process.env.TZ = 'America/Los_Angeles';
};
