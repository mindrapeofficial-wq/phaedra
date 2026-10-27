// Import the suites in the same Node process; this also works in environments
// that prohibit spawning a child test runner.
import './stoat-client.test.mjs';
import './view-model.test.mjs';
import './build.test.mjs';
import './app-lifecycle.test.mjs';
