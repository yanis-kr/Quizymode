namespace Quizymode.Api.Shared.Options;

public sealed record class CategoryOptions
{
    public const string SectionName = "Category";

    public int CategoriesCacheTtlMinutes { get; init; } = 5;
}

