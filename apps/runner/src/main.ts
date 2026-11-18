import { createRunnerServer } from './server.js';

const token = process.env.RUNNER_TOKEN ?? '';
if (token.length < 16) {
  console.error('RUNNER_TOKEN must be set (at least 16 characters)');
  process.exit(1);
}
const port = Number(process.env.PORT ?? 2000);
const server = createRunnerServer({
  token,
  concurrency: Number(process.env.RUNNER_CONCURRENCY ?? 2),
  maxQueue: Number(process.env.RUNNER_MAX_QUEUE ?? 16),
});
server.listen(port, () =>
  process.stdout.write(`${JSON.stringify({ msg: 'runner listening', port })}\n`),
);
const stop = () => server.close(() => process.exit(0));
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
