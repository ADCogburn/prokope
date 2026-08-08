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
    public DbSet<ClassTemplate> ClassTemplates => Set<ClassTemplate>();
    public DbSet<ClassTemplateSubject> ClassTemplateSubjects => Set<ClassTemplateSubject>();
    public DbSet<ClassTemplateLesson> ClassTemplateLessons => Set<ClassTemplateLesson>();

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

        // #168: class_template/class_template_subject/class_template_lesson
        // are immutable, create-only rows with no deleted_at -- unlike the
        // rest of this schema, soft-delete isn't how they'd ever go away, so
        // ClassTemplateSubject/ClassTemplateLesson cascade-delete on their
        // parent instead of the RESTRICT every other FK here uses.
        modelBuilder.Entity<ClassTemplate>(entity =>
        {
            entity.ToTable("class_template");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<ClassTemplate, User>(entity, e => e.UserId);
        });

        modelBuilder.Entity<ClassTemplateSubject>(entity =>
        {
            entity.ToTable("class_template_subject");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<ClassTemplateSubject, ClassTemplate>(
                entity, e => e.ClassTemplateId, DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ClassTemplateLesson>(entity =>
        {
            entity.ToTable("class_template_lesson");
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.UpdatedAt);
            ConfigureForeignKey<ClassTemplateLesson, ClassTemplateSubject>(
                entity, e => e.ClassTemplateSubjectId, DeleteBehavior.Cascade);
        });
    }

    // Every FK in this schema is a required many-to-one with no inverse navigation
    // property. Defaults to RESTRICT (soft-delete via deleted_at is how rows go
    // away for every other table); the class_template trio above passes Cascade
    // explicitly since they have no deleted_at to soft-delete through.
    private static void ConfigureForeignKey<TEntity, TParent>(
        EntityTypeBuilder<TEntity> entity,
        Expression<Func<TEntity, object?>> foreignKey,
        DeleteBehavior deleteBehavior = DeleteBehavior.Restrict)
        where TEntity : class
        where TParent : class
    {
        entity.HasOne<TParent>()
            .WithMany()
            .HasForeignKey(foreignKey)
            .OnDelete(deleteBehavior);
    }
}
