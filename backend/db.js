const mysql = require("mysql2/promise");
// for env variables
require('dotenv').config();

class Database {
  constructor(databaseName) {
    this.databaseName = databaseName;

    this.pool = mysql.createPool({
      uri: process.env.DATABASE_URL
    });

    console.log("Database pool created successfully");
  }

  async getConnection() {
    try {
      const connection = await this.pool.getConnection();
      console.log("Database Connected Successfully");
      return connection;
    } catch (err) {
      console.error("Database connection error:", err);
      throw err;
    }
  }

  async createTable(createTableQuery) {
    const conn = await this.getConnection();
    try {
      await conn.execute(createTableQuery);
      console.log("Table created successfully.");
      return true;
    } catch (err) {
      console.error("Error:", err);
      return false;
    } finally {
      conn.release();
    }
  }

  async insertData(insertQuery, data) {
    const conn = await this.getConnection();
    try {
      await conn.execute(insertQuery, data);
      console.log("Data inserted successfully.");
      return true;
    } catch (err) {
      console.error("Error:", err);
      return false;
    } finally {
      conn.release();
    }
  }

  async updateData(updateQuery, data) {
    const conn = await this.getConnection();
    try {
      await conn.execute(updateQuery, data);
      console.log("Data updated successfully.");
      return true;
    } catch (err) {
      console.error("Error:", err);
      return false;
    } finally {
      conn.release();
    }
  }

  async fetchData(fetchQuery, data) {
    const conn = await this.getConnection();
    try {
      const [rows] = await conn.execute(fetchQuery, data);
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error("Error:", err);
      return null;
    } finally {
      conn.release();
    }
  }

  async fetchAllData(fetchQuery, data) {
    const conn = await this.getConnection();
    try {
      const [rows] = await conn.execute(fetchQuery, data);
      return rows;
    } catch (err) {
      console.error("Error:", err);
      return null;
    } finally {
      conn.release();
    }
  }

  async fetchDataWithoutValue(fetchQuery) {
    const conn = await this.getConnection();
    try {
      const [rows] = await conn.execute(fetchQuery);
      return rows;
    } catch (err) {
      console.error("Error:", err);
      return null;
    } finally {
      conn.release();
    }
  }

  async deleteData(query, data) {
    const conn = await this.getConnection();
    try {
      await conn.execute(query, data);
      return true;
    } catch (err) {
      console.error("Error:", err);
      return false;
    } finally {
      conn.release();
    }
  }
}

module.exports = Database;
