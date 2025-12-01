import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./features/home/pages/HomePage";
import CategoriesPage from "./features/categories/pages/CategoriesPage";
import ItemsPage from "./features/items/pages/ItemsPage";
import ExploreModePage from "./features/items/pages/ExploreModePage";
import QuizModePage from "./features/items/pages/QuizModePage";
import LoginPage from "./features/auth/pages/LoginPage";
import SignUpPage from "./features/auth/pages/SignUpPage";
import MyItemsPage from "./features/items/pages/MyItemsPage";
import CreateItemPage from "./features/items/pages/CreateItemPage";
import CollectionsPage from "./features/collections/pages/CollectionsPage";
import CollectionDetailPage from "./features/collections/pages/CollectionDetailPage";
import AdminDashboardPage from "./features/admin/pages/AdminDashboardPage";
import ReviewBoardPage from "./features/admin/pages/ReviewBoardPage";
import BulkCreatePage from "./features/admin/pages/BulkCreatePage";
import BulkCreateItemsPage from "./features/items/pages/BulkCreateItemsPage";
import ItemCommentsPage from "./features/items/pages/ItemCommentsPage";
import EditItemPage from "./features/items/pages/EditItemPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/items" element={<ItemsPage />} />
        <Route path="/explore/item/:itemId" element={<ExploreModePage />} />
        <Route
          path="/explore/:category/item/:itemId"
          element={<ExploreModePage />}
        />
        <Route
          path="/explore/collection/:collectionId/item/:itemId"
          element={<ExploreModePage />}
        />
        <Route
          path="/explore/collection/:collectionId"
          element={<ExploreModePage />}
        />
        <Route path="/explore/:category?" element={<ExploreModePage />} />
        <Route path="/quiz/item/:itemId" element={<QuizModePage />} />
        <Route path="/quiz/:category/item/:itemId" element={<QuizModePage />} />
        <Route
          path="/quiz/collection/:collectionId/item/:itemId"
          element={<QuizModePage />}
        />
        <Route
          path="/quiz/collection/:collectionId"
          element={<QuizModePage />}
        />
        <Route path="/quiz/:category?" element={<QuizModePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route path="/my-items" element={<MyItemsPage />} />
        <Route path="/my-items/bulk-create" element={<BulkCreateItemsPage />} />
        <Route path="/items/create" element={<CreateItemPage />} />
        <Route path="/items/:id/edit" element={<EditItemPage />} />
        <Route path="/items/:id/comments" element={<ItemCommentsPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/bulk-create" element={<BulkCreatePage />} />
        <Route path="/admin/review-board" element={<ReviewBoardPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
