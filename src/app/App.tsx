import { Route, Routes } from 'react-router-dom';
import { Layout } from './Layout';
import { Home } from '../pages/Home';
import { ToolPage } from '../pages/ToolPage';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="herramienta/:id" element={<ToolPage />} />
        <Route path="*" element={<Home />} />
      </Route>
    </Routes>
  );
}
