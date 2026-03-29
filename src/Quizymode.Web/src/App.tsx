import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./features/home/pages/HomePage";
import CategoriesPage from "./features/categories/pages/CategoriesPage";
import ItemsPage from "./features/items/pages/ItemsPage";
import ExploreModePage from "./features/items/pages/ExploreModePage";
import QuizModePage from "./features/items/pages/QuizModePage";
import LoginPage from "./features/auth/pages/LoginPage";
import SignUpPage from "./features/auth/pages/SignUpPage";
import CreateItemPage from "./features/items/pages/CreateItemPage";
import ItemDetailPage from "./features/items/pages/ItemDetailPage";
import CollectionsPage from "./features/collections/pages/CollectionsPage";
import CollectionDetailPage from "./features/collections/pages/CollectionDetailPage";
import AdminDashboardPage from "./features/admin/pages/AdminDashboardPage";
import ReviewBoardPage from "./features/admin/pages/ReviewBoardPage";
import DatabaseSizePage from "./features/admin/pages/DatabaseSizePage";
import AuditLogsPage from "./features/admin/pages/AuditLogsPage";
import AdminKeywordsPage from "./features/admin/pages/AdminKeywordsPage";
import AdminKeywordReviewPage from "./features/admin/pages/AdminKeywordReviewPage";
import AdminCategoriesPage from "./features/admin/pages/AdminCategoriesPage";
import AdminUserSettingsPage from "./features/admin/pages/AdminUserSettingsPage";
import AdminSeedSyncPage from "./features/admin/pages/AdminSeedSyncPage";
import PageViewAnalyticsPage from "./features/admin/pages/PageViewAnalyticsPage";
import BulkCreateItemsPage from "./features/items/pages/BulkCreateItemsPage";
import AddItemsPage from "./features/items/pages/AddItemsPage";
import UploadToCollectionPage from "./features/items/pages/UploadToCollectionPage";
import ItemCommentsPage from "./features/items/pages/ItemCommentsPage";
import EditItemPage from "./features/items/pages/EditItemPage";
import AboutPage from "./features/about/pages/AboutPage";
import RoadmapPage from "./features/roadmap/pages/RoadmapPage";
import FeedbackPage from "./features/feedback/pages/FeedbackPage";
import StudyGuidePage from "./features/studyGuide/pages/StudyGuidePage";
import StudyGuideImportPage from "./features/studyGuide/pages/StudyGuideImportPage";
import PrivacyPolicyPage from "./features/legal/pages/PrivacyPolicyPage";
import TermsOfServicePage from "./features/legal/pages/TermsOfServicePage";
import PageViewTracker from "./features/analytics/PageViewTracker";
import RequireAuthRoute from "./components/RequireAuthRoute";

function App() {
  return (
    <Layout>
      <PageViewTracker />
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
          path="/explore/collections/:collectionId/:slug/item/:itemId"
          element={<ExploreModePage />}
        />
        <Route
          path="/explore/collections/:collectionId/item/:itemId"
          element={<ExploreModePage />}
        />
        <Route
          path="/explore/collections/:collectionId/:slug"
          element={<ExploreModePage />}
        />
        <Route
          path="/explore/collections/:collectionId"
          element={<ExploreModePage />}
        />
        <Route path="/explore/:category?" element={<ExploreModePage />} />
        <Route path="/quiz/item/:itemId" element={<QuizModePage />} />
        <Route path="/quiz/:category/item/:itemId" element={<QuizModePage />} />
        <Route
          path="/quiz/collections/:collectionId/:slug/item/:itemId"
          element={<QuizModePage />}
        />
        <Route
          path="/quiz/collections/:collectionId/item/:itemId"
          element={<QuizModePage />}
        />
        <Route
          path="/quiz/collections/:collectionId/:slug"
          element={<QuizModePage />}
        />
        <Route
          path="/quiz/collections/:collectionId"
          element={<QuizModePage />}
        />
        <Route path="/quiz/:category?" element={<QuizModePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignUpPage />} />
        <Route element={<RequireAuthRoute />}>
          <Route path="/items/add" element={<AddItemsPage />} />
          <Route path="/items/bulk-create" element={<BulkCreateItemsPage />} />
          <Route path="/items/upload" element={<UploadToCollectionPage />} />
          <Route path="/add-new-item" element={<CreateItemPage />} />
          <Route path="/items/create" element={<CreateItemPage />} />
          <Route path="/items/:id/edit" element={<EditItemPage />} />
          <Route path="/study-guide" element={<StudyGuidePage />} />
          <Route path="/study-guide/import" element={<StudyGuideImportPage />} />
        </Route>
        <Route path="/items/:id/comments" element={<ItemCommentsPage />} />
        <Route path="/items/:id" element={<ItemDetailPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/collections/:id/:slug" element={<CollectionDetailPage />} />
        <Route path="/collections/:id" element={<CollectionDetailPage />} />
        <Route element={<RequireAuthRoute requireAdmin />}>
          <Route path="/admin" element={<AdminDashboardPage />} />
          <Route path="/admin/review-board" element={<ReviewBoardPage />} />
          <Route path="/admin/database-size" element={<DatabaseSizePage />} />
          <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
          <Route path="/admin/keywords" element={<AdminKeywordsPage />} />
          <Route path="/admin/keyword-review" element={<AdminKeywordReviewPage />} />
          <Route path="/admin/categories" element={<AdminCategoriesPage />} />
          <Route path="/admin/user-settings" element={<AdminUserSettingsPage />} />
          <Route path="/admin/seed-sync" element={<AdminSeedSyncPage />} />
          <Route path="/admin/page-views" element={<PageViewAnalyticsPage />} />
        </Route>
        <Route path="/about" element={<AboutPage />} />
        <Route path="/roadmap" element={<RoadmapPage />} />
        <Route path="/feedback" element={<FeedbackPage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfServicePage />} />
        <Route path="/terms-of-service" element={<TermsOfServicePage />} />
      </Routes>
    </Layout>
  );
}

export default App;
