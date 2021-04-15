const http = require('http');
const Koa = require('koa');
const cors = require('@koa/cors');
const bodyParser = require('koa-bodyparser');
const ws = require('ws');
const uuid = require('uuid');

const app = new Koa();
app.use(cors());
app.use(bodyParser());

const httpServer = http.createServer(app.callback()).listen(process.env.PORT || 5555, () => console.log('Server is working'));
const wsServer = new ws.Server({ server: httpServer });

const users = [{
  name: 'user1',
  userId: '1',
}];

function formatDateElement(dateElement) {
  return String(dateElement).padStart(2, '0');
}

function renderCreatedTime() {
  const date = new Date();
  const timePart = `${formatDateElement(date.getHours())}:${formatDateElement(date.getMinutes())}`;
  const shortYear = date.getFullYear().toString().substr(2, 2);
  const datePart = `${formatDateElement(date.getDate())}.${formatDateElement(date.getMonth() + 1)}.${shortYear}`;
  return `${timePart} ${datePart}`;
}

const messages = [
  { user: 'user1', time: renderCreatedTime(), message: 'Привет' },
  { user: 'user1', time: renderCreatedTime(), message: 'Как дела' },
];

app.use((ctx) => {
  if (ctx.path !== '/register') {
    ctx.response.status = 404;
    return;
  }

  const { name } = ctx.request.body;
  if (!name) {
    ctx.response.body = { status: 'error' };
    return;
  }

  if (users.some((user) => user.name === name)) {
    ctx.response.body = { status: 'duplicated' };
    return;
  }

  const userId = uuid.v4();
  users.push({ name, userId });
  wsServer.clients.forEach((client) => client.send(JSON.stringify({ type: 'newUser', name })));
  ctx.response.body = { status: 'ok', userId };
});

wsServer.on('connection', (client, req) => {
  const userId = req.url.slice(2);
  const connectedUser = users.find((user) => user.userId === userId);
  if (connectedUser) {
    connectedUser.client = client;
  }

  client.on('message', (rawMsg) => {
    try {
      const msg = JSON.parse(rawMsg);
      const author = users.find((user) => user.userId === msg.userId);
      if (!author) {
        throw Error('Missing author');
      }

      if (!msg.message) {
        throw Error('Missing author');
      }

      const message = { user: author.name, time: renderCreatedTime(), message: msg.message };
      messages.push(message);
      wsServer.clients.forEach((connectedClient) => connectedClient.send(JSON.stringify({ type: 'message', message })));
    } catch (err) {
      console.log('Error', err);
    }
  });

  client.on('close', () => {
    const leaverIdx = users.findIndex((user) => user.client === client);
    if (leaverIdx !== -1) {
      wsServer.clients.forEach((connectedClient) => connectedClient.send(JSON.stringify({ type: 'userExit', name: users[leaverIdx].name })));
      users.splice(leaverIdx, 1);
    }
  });

  const userNames = users.map((user) => user.name);
  client.send(JSON.stringify({ type: 'initial', users: userNames, messages }));
});
