import 'package:flutter/material.dart';

import '../../design/tokens.dart';
import '../auth/auth_controller.dart';
import 'trainer_students_controller.dart';

/// Экран «Ученики» тренера (H10).
///
/// Список детей из групп тренера с поиском. Поиск локальный: учеников в клубе
/// десятки, и сетевой запрос на каждое нажатие был бы медленнее фильтрации.
class TrainerStudentsScreen extends StatefulWidget {
  const TrainerStudentsScreen({
    super.key,
    required this.auth,
    required this.controller,
  });

  final AuthController auth;
  final TrainerStudentsController controller;

  @override
  State<TrainerStudentsScreen> createState() => _TrainerStudentsScreenState();
}

class _TrainerStudentsScreenState extends State<TrainerStudentsScreen> {
  final _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _load() {
    final token = widget.auth.session?.accessToken;
    if (token != null) {
      widget.controller.load(token);
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final controller = widget.controller;

        if (controller.loading) {
          return const Center(child: CircularProgressIndicator());
        }

        final error = controller.error;
        if (error != null) {
          return Center(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xl),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.cloud_off, size: 40, color: AppColors.textSecondary),
                  const SizedBox(height: AppSpacing.md),
                  Text(error, textAlign: TextAlign.center),
                  const SizedBox(height: AppSpacing.lg),
                  FilledButton.tonal(onPressed: _load, child: const Text('Повторить')),
                ],
              ),
            ),
          );
        }

        final students = controller.students;

        return ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          children: [
            Text('Ученики', style: Theme.of(context).textTheme.headlineMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Всего: ${controller.totalCount}',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),

            TextField(
              controller: _searchController,
              onChanged: controller.search,
              decoration: const InputDecoration(
                hintText: 'Поиск по ученикам',
                prefixIcon: Icon(Icons.search, size: 20),
              ),
            ),
            const SizedBox(height: AppSpacing.lg),

            if (students.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: AppSpacing.xxl),
                child: Column(
                  children: [
                    Icon(Icons.people_outline, size: 36, color: AppColors.textSecondary),
                    SizedBox(height: AppSpacing.md),
                    Text(
                      'Учеников нет',
                      style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    SizedBox(height: AppSpacing.sm),
                    Text(
                      'Когда спортсменов добавят в ваши группы, они появятся здесь.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              )
            else
              for (final student in students) ...[
                _StudentTile(name: student.displayName, groups: student.groupNames),
                const SizedBox(height: AppSpacing.sm),
              ],
          ],
        );
      },
    );
  }
}

class _StudentTile extends StatelessWidget {
  const _StudentTile({required this.name, required this.groups});

  final String name;
  final List<String> groups;

  @override
  Widget build(BuildContext context) {
    final initial = name.isEmpty ? '?' : name.characters.first;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.divider),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: AppColors.accentSoft,
            child: Text(
              initial,
              style: const TextStyle(
                color: AppColors.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  style: const TextStyle(fontWeight: FontWeight.w600),
                ),
                if (groups.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    groups.join(' · '),
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
