import { supabase } from "@/lib/supabase";

export default async function TestPage() {

  const { data, error } = await supabase
    .from("company")
    .select("*")
    .limit(5);

  return (
    <main>
      <h1>Supabase Connection Test</h1>

      {error ? (
        <p>
          Error: {error.message}
        </p>
      ) : (
        <pre>
          {JSON.stringify(data, null, 2)}
        </pre>
      )}

    </main>
  );
}
