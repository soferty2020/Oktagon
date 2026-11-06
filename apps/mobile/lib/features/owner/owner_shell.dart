import 'package:flutter/material.dart';

import '../../core/api_client.dart';
import '../../design/tokens.dart';
import '../../widgets/brand_app_bar.dart';
import '../attestations/attestation_controller.dart';
import '../admin/trial_requests_screen.dart';
import '../chat/chat_controller.dart';
import '../chat/chats_controller.dart';
import '../news/news_controller.dart';
import '../auth/auth_controller.dart';
import 'owner_athletes_screen.dart';
import 'owner_finance_screen.dart';
import 'owner_more_screen.dart';
import 'owner_overview_screen.dart';
import 'owner_schedule_screen.dart';

/// Каркас приложения владельца клуба.
///
/// Заменяет прежний `AdminShell` с четырьмя разделами. Нижняя навигация —
/// пять разделов по утверждённой концепции: Обзор, Спортсмены, Расписание,
/// Финансы, Ещё. Заявки, аттестации, отчёты, группы, тренеры, чаты и новости
/// живут внутри «Обзора» и «Ещё», чтобы основные действия были на первом экране.
///
/// Данные берутся из тех же API, что и веб-админка: отдельных «мобильных»
/// эндпоинтов нет, цифры обязаны совпадать.
class OwnerShell extends StatefulWidget {
  const OwnerShell({
    super.key,
    required this.auth,
    required this.attestations,
    required this.trialRequests,
    required this.news,
    required this.chats,
    required this.chatFactory,
    required this.client,
  });

  final AuthController auth;
  final AttestationController attestations;
  final TrialRequestsController trialRequests;
  final NewsController news;
  final ChatsController chats;
  final ChatController Function() chatFactory;
  final ApiClient client;

  @override
  State<OwnerShell> createState() => _OwnerShellState();
}

class _OwnerShellState extends State<OwnerShell> {
  int _index = 0;

  /// Показываем шапку с логотипом только на корневых экранах: на вложенных
  /// страницах («Аттестации», «Заявки») её заменяет AppBar с кнопкой «назад».
  bool _showBrandBar = true;

  void _openNested(Widget screen) {
    setState(() => _showBrandBar = false);
    Navigator.of(context)
        .push(MaterialPageRoute<void>(builder: (_) => screen))
        .whenComplete(() => setState(() => _showBrandBar = true));
  }

  @override
  Widget build(BuildContext context) {
    final screens = [
      OwnerOverviewScreen(
        auth: widget.auth,
        client: widget.client,
        onOpen: _openNested,
        onOpenTrialRequests: () => _openNested(
          TrialRequestsScreen(auth: widget.auth, controller: widget.trialRequests),
        ),
      ),
      OwnerAthletesScreen(auth: widget.auth, client: widget.client),
      OwnerScheduleScreen(auth: widget.auth, client: widget.client),
      OwnerFinanceScreen(auth: widget.auth, client: widget.client),
      OwnerMoreScreen(
        auth: widget.auth,
        client: widget.client,
        attestations: widget.attestations,
        trialRequests: widget.trialRequests,
        news: widget.news,
        chats: widget.chats,
        chatFactory: widget.chatFactory,
        onOpen: _openNested,
      ),
    ];

    return Scaffold(
      appBar: _showBrandBar
          ? BrandAppBar(
              actions: [
                IconButton(
                  tooltip: 'Обновить',
                  icon: const Icon(Icons.refresh, color: Colors.white),
                  onPressed: () => setState(() {}),
                ),
              ],
            )
          : null,
      body: SafeArea(
        child: IndexedStack(index: _index, children: screens),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (index) => setState(() => _index = index),
        backgroundColor: Colors.white,
        indicatorColor: AppColors.accentSoft,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.donut_large_outlined),
            selectedIcon: Icon(Icons.donut_large),
            label: 'Обзор',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'Спортсмены',
          ),
          NavigationDestination(
            icon: Icon(Icons.calendar_today_outlined),
            selectedIcon: Icon(Icons.calendar_today),
            label: 'Расписание',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'Финансы',
          ),
          NavigationDestination(
            icon: Icon(Icons.more_horiz),
            selectedIcon: Icon(Icons.more_horiz),
            label: 'Ещё',
          ),
        ],
      ),
    );
  }
}
