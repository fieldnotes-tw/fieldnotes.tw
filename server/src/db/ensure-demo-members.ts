import { ensureChenEnMember } from '../lib/demo-members.js';

ensureChenEnMember()
  .then((userId) => {
    console.log(`陳恩 member ready: ${userId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
