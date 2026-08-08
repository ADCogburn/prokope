using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using server.Data.Entities;

namespace server.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Class> Classes => Set<Class>();
    public DbSet<Subject> Subjects => Set<Subject>();
    public DbSet<Lesson> Lessons => Set<Lesson>();
    public DbSet<Student> Students => Set<Student>();
    public DbSet<Progress> Progress => Set<Progress>();
    public DbSet<ReviewFlag> ReviewFlags => Set<ReviewFlag>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("users");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.GoogleSub).IsUnique();
        });

        modelBuilder.Entity<Class>(entity =>
        {
            entity.ToTable("class");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<Class, User>(entity, e => e.UserId);
        });

        modelBuilder.Entity<Subject>(entity =>
        {
            entity.ToTable("subject");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<Subject, Class>(entity, e => e.ClassId);
        });

        modelBuilder.Entity<Lesson>(entity =>
        {
            entity.ToTable("lesson");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.SubjectId, e.Unit, e.LessonInUnit }).IsUnique();
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<Lesson, Subject>(entity, e => e.SubjectId);
        });

        modelBuilder.Entity<Student>(entity =>
        {
            entity.ToTable("student");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<Student, Class>(entity, e => e.ClassId);
        });

        modelBuilder.Entity<Progress>(entity =>
        {
            entity.ToTable("progress");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.StudentId, e.SubjectId }).IsUnique();
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<Progress, Student>(entity, e => e.StudentId);
            ConfigureForeignKey<Progress, Subject>(entity, e => e.SubjectId);
        });

        modelBuilder.Entity<ReviewFlag>(entity =>
        {
            entity.ToTable("review_flag");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => new { e.StudentId, e.LessonId }).IsUnique();
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<ReviewFlag, Student>(entity, e => e.StudentId);
            ConfigureForeignKey<ReviewFlag, Lesson>(entity, e => e.LessonId);
        });
    }

    // Every FK in this schema is a required many-to-one with no inverse navigation
    // property, and RESTRICT delete (soft-delete via deleted_at is how rows go away).
    private static void ConfigureForeignKey<TEntity, TParent>(
        EntityTypeBuilder<TEntity> entity, Expression<Func<TEntity, object?>> foreignKey)
        where TEntity : class
        where TParent : class
    {
        entity.HasOne<TParent>()
            .WithMany()
            .HasForeignKey(foreignKey)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
