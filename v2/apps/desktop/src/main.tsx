import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { createWorkspaceRouter } from './routing/router';
import { client } from './api';
import './styles.css';

const router = createWorkspaceRouter(client);
createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />);
