'use strict';

async function sendTelegramTest() {
  return {
    ok: true,
    configured: false,
    note: 'Notification test is disabled in this environment.'
  };
}

module.exports = {
  sendTelegramTest
};
