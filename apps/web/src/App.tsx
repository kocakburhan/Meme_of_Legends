import { createBrowserRouter, RouterProvider, type RouteObject } from 'react-router';
import JoinPage from '@/pages/JoinPage';
import { loadBusiness, saveBusiness } from './net/consoleAuth';
import { lazy, Suspense } from 'react';
