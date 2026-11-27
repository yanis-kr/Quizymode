import { Link } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import { collectionsApi } from "@/api/collections";
import { ABOUT_COLLECTION_IDS } from "@/features/home/homePageData";
import type { CollectionResponse } from "@/types/api";
import { AboutSection } from "./AboutSection";
import { aboutQuestionCountLabel } from "./aboutCollectionCount";
import { aboutBodyClass, aboutCardClass, aboutLinkClass } from "./aboutStyles";

const CollectionCard = ({ collection }: { collection: CollectionResponse }) => {
  const count = aboutQuestionCountLabel(collection.itemCount);
  const description = collection.description?.trim();
  return (
    <li className={aboutCardClass} data-testid="about-collection-card" data-collection-id={collection.id}>
      <Link
        to={`/collections/${collection.id}`}
        className={`${aboutLinkClass} inline-flex min-h-[44px] items-center text-sm font-semibold`}
      >
        {collection.name}
      </Link>
      {description && <p className="text-sm leading-relaxed text-slate-600">{description}</p>}
      {count && (
        <p className="mt-1 text-xs text-slate-500" data-testid="about-collection-count">
          {count}
        </p>
      )}
    </li>
  );
};

/**
 * Explore something fascinating (#883, #885): live cards for the three curated sets (`GET /collections/{id}`, shared
 * cache key with the collection page). A set that fails to load hides only its own card; the featured link always stays.
 */
export const AboutCollections = () => {
  const results = useQueries({
    queries: ABOUT_COLLECTION_IDS.map((id) => ({
      queryKey: ["collection", id],
      queryFn: () => collectionsApi.getById(id),
      retry: 0,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const loaded = results
    .map((result) => result.data)
    .filter((collection): collection is CollectionResponse => Boolean(collection?.id && collection.name));

  return (
    <AboutSection id="about-explore" title="Start with something odd.">
      <p className={aboutBodyClass}>Three sets that tend to end with &ldquo;wait, really?&rdquo;</p>
      {loaded.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {loaded.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </ul>
      )}
      <Link to="/featured" className={`${aboutLinkClass} mt-1 inline-flex min-h-[44px] items-center text-sm`}>
        All featured sets
      </Link>
      <p className={aboutBodyClass}>
        Also in the building: certification prep (AWS and friends), 16 languages, and all 195 country flags, including the
        ones you will confuse with each other.
      </p>
    </AboutSection>
  );
};
