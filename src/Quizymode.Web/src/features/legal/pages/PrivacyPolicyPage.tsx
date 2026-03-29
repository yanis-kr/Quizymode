import LegalMarkdownDocument from "@/features/legal/components/LegalMarkdownDocument";
import privacyPolicyMarkdown from "../../../../../../docs/quizymode-privacy-policy.md?raw";

const PrivacyPolicyPage = () => {
  return (
    <LegalMarkdownDocument
      title="Privacy Policy"
      description="How Quizymode collects, uses, stores, and shares account, content, and analytics information."
      canonical="https://www.quizymode.com/privacy"
      markdown={privacyPolicyMarkdown}
    />
  );
};

export default PrivacyPolicyPage;
