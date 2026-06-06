import axios from 'axios';

// Cria a conexão base apontando para o nosso backend em Python
export const api = axios.create({
  baseURL: 'http://localhost:8000/api',
});