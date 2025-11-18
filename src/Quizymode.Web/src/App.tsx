import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './features/categories/pages/CategoriesPage';
import ItemsPage from './features/items/pages/ItemsPage';
import ExploreModePage from './features/items/pages/ExploreModePage';
import QuizModePage from './features/items/pages/QuizModePage';
import LoginPage from './features/auth/pages/LoginPage';
import SignUpPage from './features/auth/pages/SignUpPage';
import MyItemsPage from './features/items/pages/MyItemsPage';
import CollectionsPage from './features/collections/pages/CollectionsPage';
import CollectionDetailPage from './features/collections/pages/CollectionDetailPage';
import AdminDashboardPage from './features/admin/pages/AdminDashboardPage';
import ReviewBoardPage from './features/admin/pages/ReviewBoardPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/categories" element={<HomePage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/explore/:category?" element={<ExploreModePage />} />
        <Route path="/quiz/:category?" element={<QuizModePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/my-items" element={<MyItemsPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/review-board" element={<ReviewBoardPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
