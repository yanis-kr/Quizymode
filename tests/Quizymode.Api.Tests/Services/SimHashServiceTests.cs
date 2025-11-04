using FluentAssertions;
using Quizymode.Api.Services;
using Xunit;

namespace Quizymode.Api.Tests.Services;

public sealed class SimHashServiceTests
{
    private readonly SimHashService _service = new();

    [Fact]
    public void ComputeSimHash_ValidText_ReturnsHash()
    {
        // Arrange
        string text = "What is the capital of France? Paris Lyon Marseille";

        // Act
        string hash = _service.ComputeSimHash(text);

        // Assert
        hash.Should().NotBeNullOrEmpty();
        hash.Length.Should().Be(16); // 16 hex characters = 64 bits
    }

    [Fact]
    public void ComputeSimHash_EmptyString_ReturnsZeroHash()
    {
        // Act
        string hash = _service.ComputeSimHash("");

        // Assert
        hash.Should().Be("0000000000000000");
    }

    [Fact]
    public void ComputeSimHash_NullString_ReturnsZeroHash()
    {
        // Act
        string hash = _service.ComputeSimHash(null!);

        // Assert
        hash.Should().Be("0000000000000000");
    }

    [Fact]
    public void ComputeSimHash_SameText_ReturnsSameHash()
    {
        // Arrange
        string text = "What is the capital of France? Paris Lyon Marseille";

        // Act
        string hash1 = _service.ComputeSimHash(text);
        string hash2 = _service.ComputeSimHash(text);

        // Assert
        hash1.Should().Be(hash2);
    }

    [Fact]
    public void ComputeSimHash_SimilarText_ReturnsSimilarHash()
    {
        // Arrange
        string text1 = "What is the capital of France? Paris Lyon Marseille";
        string text2 = "What is the capital of france? paris lyon marseille"; // Different case

        // Act
        string hash1 = _service.ComputeSimHash(text1);
        string hash2 = _service.ComputeSimHash(text2);

        // Assert
        hash1.Should().Be(hash2); // SimHash should be case-insensitive
    }

    [Fact]
    public void GetFuzzyBucket_ValidHash_ReturnsBucket()
    {
        // Arrange
        string hash = "ABCD1234567890EF";

        // Act
        int bucket = _service.GetFuzzyBucket(hash);

        // Assert
        bucket.Should().BeGreaterOrEqualTo(0);
        bucket.Should().BeLessThan(256); // 8 bits = 0-255
    }

    [Fact]
    public void GetFuzzyBucket_EmptyString_ReturnsZero()
    {
        // Act
        int bucket = _service.GetFuzzyBucket("");

        // Assert
        bucket.Should().Be(0);
    }

    [Fact]
    public void GetFuzzyBucket_NullString_ReturnsZero()
    {
        // Act
        int bucket = _service.GetFuzzyBucket(null!);

        // Assert
        bucket.Should().Be(0);
    }
}

