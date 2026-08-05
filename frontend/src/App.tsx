import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import { RepositoriesList } from './features/repos/pages/RepositoriesList';
import { RepositoryDetails } from './features/repos/pages/RepositoryDetails';
import { PRReview } from './features/reviews/pages/PRReview';
import { Settings } from './features/settings/pages/Settings';
import SocketProvider from './components/providers/SocketProvider';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />}>
            <Route index element={<RepositoriesList />} />
            <Route path="repo/:id" element={<RepositoryDetails />} />
            <Route path="repo/:id/review/:prId" element={<PRReview />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
