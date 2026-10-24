import UploadToCollectionPage from "./UploadToCollectionPage";

/** /create/import: the paste-text / JSON import into a new collection (POST /items/upload-to-collection), opened on Paste text. */
const CreateImportPage = () => <UploadToCollectionPage initialTab="paste" heading="Import questions" />;

export default CreateImportPage;
