import LegalMarkdownDocument from "@/features/legal/components/LegalMarkdownDocument";
import termsOfServiceMarkdown from "../../../../../../docs/legal/quizymode-terms-of-service.md?raw";

const TermsOfServicePage = () => {
  return (
    <LegalMarkdownDocument
      title="Terms of Service"
      description="The terms that govern your use of Quizymode, including content responsibilities and complaint handling."
      canonical="https://www.quizymode.com/terms"
      markdown={termsOfServiceMarkdown}
    />
  );
};

export default TermsOfServicePage;
