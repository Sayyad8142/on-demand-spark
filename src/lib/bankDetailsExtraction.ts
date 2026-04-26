import { supabase } from "@/integrations/supabase/client";

export interface ExtractedBankDetails {
  account_holder_name?: string | null;
  bank_account_number?: string | null;
  ifsc_code?: string | null;
  bank_name?: string | null;
  confidence?: number | null;
}

export async function extractBankDetailsFromPassbook(
  passbookPath: string,
  workerId?: string | null,
): Promise<ExtractedBankDetails | null> {
  const { data, error } = await supabase.functions.invoke("extract-bank-details", {
    body: {
      passbook_path: passbookPath,
      worker_id: workerId || null,
    },
  });

  if (error) {
    throw new Error(error.message || "Could not read account details from image");
  }

  return (data?.details || null) as ExtractedBankDetails | null;
}

export async function extractBankDetailsFromFile(file: File): Promise<ExtractedBankDetails | null> {
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });

  const { data, error } = await supabase.functions.invoke("extract-bank-details", {
    body: {
      image_data_url: imageDataUrl,
      file_type: file.type,
    },
  });

  if (error) {
    throw new Error(error.message || "Could not read account details from image");
  }

  return (data?.details || null) as ExtractedBankDetails | null;
}