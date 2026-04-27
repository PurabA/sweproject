import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
  console.log(`HMIS API listening on http://127.0.0.1:${port}`);
});
