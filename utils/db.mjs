import mongodb from 'mongodb';

const { MongoClient } = mongodb;

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    this.connected = false;
    this.db = null;

    MongoClient.connect(`mongodb://${host}:${port}`, { useUnifiedTopology: true })
      .then((client) => {
        this.db = client.db(database);
        this.connected = true;
      })
      .catch(() => {
        this.connected = false;
      });
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    return this.db.collection('users').countDocuments();
  }

  async nbFiles() {
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();

export default dbClient;
