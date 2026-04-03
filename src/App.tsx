import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Library from './components/Library/Library';
import Editor from './components/Editor/Editor';
import ToastContainer from './components/ToastContainer';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/editor/new" element={<Editor />} />
        <Route path="/editor/:id" element={<Editor />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastContainer />
    </HashRouter>
  );
}
