import UploadToCollectionPage from "@/features/items/pages/UploadToCollectionPage";

/** Admin > Import: the full import tool (JSON and Paste text) behind the admin route guard. */
const AdminImportPage = () => <UploadToCollectionPage initialTab="json" heading="Import" />;

export default AdminImportPage;
