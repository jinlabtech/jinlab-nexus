import StudioArtwork from "@/components/nexus-icons/artwork/StudioArtwork";

export default function NexusIllustration({
  name,
}: {
  name: string;
}) {
  return (
    <span className="nexus-real-artwork">
      <StudioArtwork
        name={name}
      />
    </span>
  );
}
