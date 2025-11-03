using System.Security.Cryptography;
using System.Text;

namespace Quizymode.Api.Services;

public interface ISimHashService
{
    string ComputeSimHash(string text);
    int GetFuzzyBucket(string simHash);
}

public class SimHashService : ISimHashService
{
    public string ComputeSimHash(string text)
    {
        if (string.IsNullOrEmpty(text))
            return "0000000000000000";

        // Normalize text: lowercase, remove extra whitespace
        var normalizedText = text.ToLowerInvariant()
            .Replace("\r", " ")
            .Replace("\n", " ")
            .Replace("\t", " ")
            .Trim();

        // Split into words and create shingles (2-grams)
        var words = normalizedText.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var shingles = new List<string>();
        
        for (int i = 0; i < words.Length - 1; i++)
        {
            shingles.Add($"{words[i]} {words[i + 1]}");
        }

        // Add individual words as well
        shingles.AddRange(words);

        // Compute hash for each shingle and create bit vector
        var bitVector = new int[64];
        
        foreach (var shingle in shingles)
        {
            var hash = ComputeHash(shingle);
            for (int i = 0; i < 64; i++)
            {
                if ((hash & (1L << i)) != 0)
                {
                    bitVector[i]++;
                }
                else
                {
                    bitVector[i]--;
                }
            }
        }

        // Convert to final hash
        var result = 0L;
        for (int i = 0; i < 64; i++)
        {
            if (bitVector[i] > 0)
            {
                result |= 1L << i;
            }
        }

        return result.ToString("X16");
    }

    public int GetFuzzyBucket(string simHash)
    {
        if (string.IsNullOrEmpty(simHash) || simHash.Length < 2)
            return 0;

        // Get top 8 bits (first 2 hex characters)
        var topBits = simHash.Substring(0, 2);
        return Convert.ToInt32(topBits, 16);
    }

    private long ComputeHash(string input)
    {
        using var sha256 = SHA256.Create();
        var hashBytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(input));
        
        // Convert first 8 bytes to long
        var result = 0L;
        for (int i = 0; i < 8; i++)
        {
            result |= ((long)hashBytes[i]) << (i * 8);
        }
        
        return result;
    }
}


