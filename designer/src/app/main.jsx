import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import * as store from './store.js';
import * as model from '../core/model.js';
import * as dsl from '../core/dsl.js';

// Debug / automation handle: window.__le.getState(), window.__le.apply([...ops]), window.__le.dsl.serializeDsl(...)
window.__le = { ...store, model, dsl };

createRoot(document.getElementById('root')).render(<App />);
