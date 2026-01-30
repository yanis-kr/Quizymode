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
import DatabaseSizePage from "./features/admin/pages/DatabaseSizePage";
import AuditLogsPage from "./features/admin/pages/AuditLogsPage";
import AdminKeywordsPage from "./features/admin/pages/AdminKeywordsPage";
import AdminCategoriesPage from "./features/admin/pages/AdminCategoriesPage";
import BulkCreateItemsPage from "./features/items/pages/BulkCreateItemsPage";
import AddItemsPage from "./features/items/pages/AddItemsPage";
import ItemCommentsPage from "./features/items/pages/ItemCommentsPage";
import EditItemPage from "./features/items/pages/EditItemPage";
import AboutPage from "./features/about/pages/AboutPage";
import RoadmapPage from "./features/roadmap/pages/RoadmapPage";
import FeedbackPage from "./features/feedback/pages/FeedbackPage";

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/categories/:category/:kw1/:kw2"
          element={<CategoriesPage />}
        />
        <Route path="/categories/:category/:kw1" element={<CategoriesPage />} />
        <Route path="/categories/:category" element={<CategoriesPage />} />
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
        <Route path="/items/add" element={<AddItemsPage />} />
        <Route path="/items/create" element={<CreateItemPage />} />
        <Route path="/items/:id/edit" element={<EditItemPage />} />
        <Route path="/items/:id/comments" element={<ItemCommentsPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/admin/review-board" element={<ReviewBoardPage />} />
        <Route path="/admin/database-size" element={<DatabaseSizePage />} />
        <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
        <Route path="/admin/keywords" element={<AdminKeywordsPage />} />
        <Route path="/admin/categories" element={<AdminCategoriesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
